/**
 * Cola de correos detenidos por la IA (solo servidor; recibe el cliente de servicio).
 * Un correo en cola tiene su texto y sus PDF guardados; se procesa en orden de llegada cuando
 * vuelve a haber margen (día siguiente, límite subido o créditos restablecidos).
 */
import { DESCARTE_BREVE } from "@/lib/correo-expediente";
import { pausaLecturaCorreos } from "@/lib/ia-consumo.server";
import { correosPorTurno, MINUTOS_COLA_INTERRUMPIDA, type CausaCola } from "@/lib/correos-cola";
import type { CamposBitacora, ResultadoProceso } from "@/lib/correo-procesar.server";

type Db = any;
const TURNO = "cola-correos-ia";

/** Cierra la línea del Registro con el resultado del proceso (webhook, cola y recuperación). */
export async function cerrarRegistroCorreo(db: Db, registroId: string, c: CamposBitacora) {
  const { error } = await db.from("correos_recibidos").update({
    resultado: c.resultado, motivo: c.motivo?.slice(0, 1000) ?? null, reintentable: c.reintentable ?? true,
    solicitud_id: c.solicitud_id ?? null, expediente_id: c.expediente_id ?? null, expediente_numero: c.expediente_numero ?? null,
    vinculo: c.vinculo ?? null, advertencias: (c.advertencias ?? []).slice(0, 50), propuestas: c.propuestas ?? {},
    ...(c.adjuntos_respaldo ? { adjuntos_respaldo: c.adjuntos_respaldo } : {}),
    ...(c.conflictos?.length ? { conflictos: c.conflictos } : {}),
    descarte_categoria: c.resultado === "descartada" ? c.descarte_categoria ?? null : null,
    // Sin PDF o remitente ignorado: solo una línea breve con el motivo, sin el texto del correo.
    ...(c.descarte_categoria && DESCARTE_BREVE.includes(c.descarte_categoria) ? { cuerpo: null, destinatarios: null, cc: null } : {}),
    ...(c.resultado === "error" ? { alerta_vista_en: null, alerta_vista_por: null } : {}),
    en_cola_desde: null, cola_causa: null,
  }).eq("id", registroId);
  if (error) console.error("No se pudo cerrar el registro del correo", registroId, error.message);
}

/** Deja el correo en cola conservando su fecha de entrada (posición) si ya estaba. */
export async function ponerEnCola(db: Db, registroId: string, r: Extract<ResultadoProceso, { tipo: "cola" }>) {
  const { error } = await db.from("correos_recibidos").update({
    resultado: "en_cola", motivo: r.motivo, reintentable: false, cola_causa: r.causa, adjuntos_respaldo: r.adjuntos_respaldo,
  }).eq("id", registroId);
  if (error) throw new Error(`No se pudo dejar el correo en cola: ${error.message}`);
  await db.from("correos_recibidos").update({ en_cola_desde: new Date().toISOString() }).eq("id", registroId).is("en_cola_desde", null);
}

/**
 * ¿Un correo nuevo debe ir directo a la cola? Sí si hay correos anteriores esperando (orden de
 * llegada) o si la lectura de PDF está detenida. Devuelve la causa a mostrar o null.
 */
export async function causaEntradaCola(db: Db, registroId: string): Promise<CausaCola | null> {
  const { data } = await db.from("correos_recibidos").select("id,cola_causa").not("en_cola_desde", "is", null)
    .in("resultado", ["en_cola", "procesando"]).neq("id", registroId).order("primer_intento_at", { ascending: true }).limit(1);
  if (data?.length) return (data[0].cola_causa as CausaCola | null) ?? "limite_ia";
  return pausaLecturaCorreos();
}

/** Rehace el cuerpo del webhook con el texto y los PDF guardados del correo. */
export async function reconstruirCorreo(db: Db, fila: any): Promise<Record<string, unknown>> {
  const { bytesABase64 } = await import("@/lib/correo-adjunto-lectura.server");
  const respaldo = (Array.isArray(fila.adjuntos_respaldo) ? fila.adjuntos_respaldo : []) as { nombre: string; mime: string; storage_path: string }[];
  const adjuntos = [];
  for (const a of respaldo) {
    const { data: blob, error } = await db.storage.from("documentos").download(a.storage_path);
    if (error || !blob) throw new Error(`No se pudo recuperar el adjunto ${a.nombre}: ${error?.message ?? "archivo no encontrado"}`);
    adjuntos.push({ nombre: a.nombre, tipo: a.mime, contenido: bytesABase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  return {
    remitente: fila.remitente, asunto: fila.asunto, cuerpo: fila.cuerpo ?? "", destinatarios: fila.destinatarios ?? undefined,
    cc: fila.cc ?? undefined, id_hilo: fila.id_hilo ?? undefined, adjuntos,
  };
}

export type ResultadoCola = { procesados: number; pendientes: number; pausa: CausaCola | null; ocupado?: boolean; detalle: string[] };

/**
 * Procesa la cola en orden de llegada, con turno exclusivo y un máximo por ejecución. Si la IA
 * vuelve a detenerse, el correo regresa a su lugar y el turno termina (nunca se adelanta otro).
 */
export async function procesarColaCorreos(db: Db, opciones: { maximo?: number; msMaximo?: number } = {}): Promise<ResultadoCola> {
  const maximo = opciones.maximo ?? 3;
  const limiteTiempo = Date.now() + (opciones.msMaximo ?? 60_000);
  const contar = async () => {
    const { count } = await db.from("correos_recibidos").select("id", { count: "exact", head: true })
      .not("en_cola_desde", "is", null).in("resultado", ["en_cola", "procesando"]);
    return count ?? 0;
  };
  if ((await contar()) === 0) return { procesados: 0, pendientes: 0, pausa: null, detalle: [] };

  const { data: turno, error: errorTurno } = await db.rpc("tomar_turno_tarea", { p_nombre: TURNO, p_segundos: 300 });
  if (errorTurno) throw new Error(`No se pudo tomar el turno de la cola: ${errorTurno.message}`);
  if (!turno) return { procesados: 0, pendientes: await contar(), pausa: null, ocupado: true, detalle: ["Otra ejecución está procesando la cola."] };

  const detalle: string[] = [];
  let procesados = 0;
  let pausa: CausaCola | null = null;
  try {
    pausa = await pausaLecturaCorreos();
    const cupo = correosPorTurno(pausa, maximo);
    const interrumpido = new Date(Date.now() - MINUTOS_COLA_INTERRUMPIDA * 60_000).toISOString();
    while (procesados < cupo && Date.now() < limiteTiempo) {
      const { data: filas, error } = await db.from("correos_recibidos").select("*").not("en_cola_desde", "is", null)
        .or(`resultado.eq.en_cola,and(resultado.eq.procesando,ultimo_intento_at.lt.${interrumpido})`)
        .order("primer_intento_at", { ascending: true }).order("id", { ascending: true }).limit(1);
      if (error) throw new Error(`No se pudo leer la cola: ${error.message}`);
      const fila = filas?.[0];
      if (!fila) break;
      const { data: tomado } = await db.from("correos_recibidos")
        .update({ resultado: "procesando", ultimo_intento_at: new Date().toISOString(), intentos: (fila.intentos ?? 0) + 1 })
        .eq("id", fila.id).eq("resultado", fila.resultado).select("id");
      if (!tomado?.length) break;

      let r: ResultadoProceso;
      try {
        const { procesarCorreo } = await import("@/lib/correo-procesar.server");
        r = await procesarCorreo(db, await reconstruirCorreo(db, fila), { registroId: fila.id });
      } catch (e) {
        r = { tipo: "fallo", status: 500, motivo: String(e instanceof Error ? e.message : e).slice(0, 500) || "Error inesperado", reintentar: false };
      }
      if (r.tipo === "cola") {
        // La IA volvió a detenerse: el correo conserva su lugar y el turno termina.
        await ponerEnCola(db, fila.id, r);
        pausa = r.causa;
        detalle.push(`${fila.asunto || fila.id}: sigue en cola.`);
        break;
      }
      procesados++;
      if (r.tipo === "fallo") {
        // Gmail ya lo marcó como procesado: el error queda visible en el Panel y se puede «Crear solicitud».
        await cerrarRegistroCorreo(db, fila.id, { resultado: "error", motivo: `Procesado desde la cola: ${r.motivo}`, reintentable: false, adjuntos_respaldo: r.adjuntos_respaldo });
        detalle.push(`${fila.asunto || fila.id}: error.`);
        continue;
      }
      await cerrarRegistroCorreo(db, fila.id, { ...r.campos, motivo: `${r.campos.motivo ?? ""} (procesado desde la cola)`.trim() });
      // Creada/adjuntada: la copia de respaldo ya no hace falta (los PDF están en la solicitud o el Expediente).
      if (r.campos.resultado !== "descartada" && !r.campos.adjuntos_respaldo) {
        const rutas = (Array.isArray(fila.adjuntos_respaldo) ? fila.adjuntos_respaldo : []).map((a: any) => a?.storage_path).filter(Boolean);
        if (rutas.length) {
          const { error: e } = await db.storage.from("documentos").remove(rutas);
          if (!e) await db.from("correos_recibidos").update({ adjuntos_respaldo: [] }).eq("id", fila.id);
        }
      }
      detalle.push(`${fila.asunto || fila.id}: ${r.campos.resultado}.`);
    }
  } finally {
    await db.rpc("soltar_turno_tarea", { p_nombre: TURNO });
  }
  return { procesados, pendientes: await contar(), pausa, detalle };
}
