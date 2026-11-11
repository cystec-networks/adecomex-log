/** Lecturas y acciones del registro de correos recibidos, siempre bajo RLS del personal. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MINUTOS_PROCESANDO_ATASCADO, remitenteIgnorado } from "@/lib/correo-expediente";

type Db = SupabaseClient<Database>;
export type CorreoRecibido = Database["public"]["Tables"]["correos_recibidos"]["Row"];

export const RESULTADO_CORREO: Record<string, { etiqueta: string; tono: "ok" | "info" | "aviso" | "error" }> = {
  creada: { etiqueta: "Solicitud creada", tono: "ok" },
  actualizada: { etiqueta: "Solicitud actualizada", tono: "ok" },
  adjuntada: { etiqueta: "Adjuntado a Expediente", tono: "info" },
  descartada: { etiqueta: "Descartado", tono: "aviso" },
  error: { etiqueta: "Error", tono: "error" },
  procesando: { etiqueta: "Procesando", tono: "aviso" },
};

/** Un «procesando» sin cierre tras unos minutos se trata como fallo: el proceso se interrumpió. */
export function correoAtascado(c: Pick<CorreoRecibido, "resultado" | "ultimo_intento_at">, ahora = Date.now()) {
  return c.resultado === "procesando" && ahora - new Date(c.ultimo_intento_at).getTime() > MINUTOS_PROCESANDO_ATASCADO * 60_000;
}

export const esFalloCorreo = (c: Pick<CorreoRecibido, "resultado" | "ultimo_intento_at">, ahora = Date.now()) =>
  c.resultado === "error" || correoAtascado(c, ahora);

/** Alertas del Panel: correos con error (o interrumpidos) y documentos nuevos llegados a Expedientes. */
export async function obtenerAlertasCorreo(db: Db) {
  const limiteAtasco = new Date(Date.now() - MINUTOS_PROCESANDO_ATASCADO * 60_000).toISOString();
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [errores, documentos] = await Promise.all([
    db.from("correos_recibidos").select("*").is("alerta_vista_en", null)
      .or(`resultado.eq.error,and(resultado.eq.procesando,ultimo_intento_at.lt.${limiteAtasco})`)
      .order("ultimo_intento_at", { ascending: false }).limit(50),
    db.from("correos_recibidos").select("*").is("alerta_vista_en", null).eq("resultado", "adjuntada")
      .gte("created_at", desde).order("created_at", { ascending: false }).limit(50),
  ]);
  if (errores.error) throw errores.error;
  if (documentos.error) throw documentos.error;
  return { errores: errores.data ?? [], documentos: documentos.data ?? [] };
}

export async function marcarAlertasCorreoVistas(db: Db, ids: string[], userId: string) {
  if (!ids.length) return;
  const { error } = await db.from("correos_recibidos").update({ alerta_vista_en: new Date().toISOString(), alerta_vista_por: userId }).in("id", ids);
  if (error) throw error;
}

/** Vista por defecto del Registro: lo que importa revisar; los descartados van en su propia pestaña. */
export const RESULTADOS_PRINCIPALES = ["error", "procesando", "creada", "actualizada", "adjuntada"] as const;

export async function registroCorreos(db: Db, filtro: string) {
  let q = db.from("correos_recibidos").select("*").order("ultimo_intento_at", { ascending: false }).limit(200);
  if (filtro === "principal") q = q.in("resultado", [...RESULTADOS_PRINCIPALES]);
  else if (filtro === "error") q = q.in("resultado", ["error", "procesando"]);
  else if (filtro === "creada") q = q.in("resultado", ["creada", "actualizada"]);
  else if (filtro !== "todos") q = q.eq("resultado", filtro);
  const { data, error } = await q;
  if (error) throw error;
  const filas = data ?? [];
  if (filtro !== "descartada") return filas;
  // El catálogo vigente también ordena los descartes manuales antiguos de remitentes ignorados.
  const { data: patrones } = await db.from("remitentes_ignorados").select("patron").eq("activo", true);
  return ordenarDescartados(filas, (patrones ?? []).map((p) => p.patron));
}

/** Retención de los descartados: adjuntos guardados 30 días, línea del Registro 90 días. */
export const DIAS_ADJUNTOS_DESCARTADOS = 30;
export const DIAS_REGISTRO_DESCARTADOS = 90;

/** Días que faltan (0 = hoy) desde el descarte; null si no aplica. */
export function diasRestantes(desde: string | null | undefined, dias: number, ahora = Date.now()): number | null {
  if (!desde) return null;
  const t = new Date(desde).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t + dias * 86_400_000 - ahora) / 86_400_000));
}

type FilaDescarte = Pick<CorreoRecibido, "descarte_categoria" | "motivo" | "adjuntos_respaldo" | "pdfs_en_gmail" | "ultimo_intento_at"> & { remitente_correo?: string | null };

/** Descartadas: primero las de remitente no ignorado que traían PDF, luego sin PDF, al final remitentes ignorados. */
export function prioridadDescarte(c: FilaDescarte, patrones: string[] = []): 0 | 1 | 2 {
  const ignorado = c.descarte_categoria === "ignorado" || (!c.descarte_categoria && /^Remitente ignorado/i.test(c.motivo ?? ""))
    || !!remitenteIgnorado(c.remitente_correo, patrones);
  if (ignorado) return 2;
  const conPdf = (Array.isArray(c.adjuntos_respaldo) && c.adjuntos_respaldo.length > 0) || (c.pdfs_en_gmail ?? 0) > 0
    || c.descarte_categoria === "sin_documentos" || c.descarte_categoria === "ambiguo";
  return conPdf ? 0 : 1;
}

export function ordenarDescartados<T extends FilaDescarte>(filas: T[], patrones: string[] = []): (T & { prioridad: 0 | 1 | 2 })[] {
  return filas.map((f, i) => ({ f: { ...f, prioridad: prioridadDescarte(f, patrones) }, i }))
    .sort((a, b) => a.f.prioridad - b.f.prioridad || a.i - b.i).map((x) => x.f);
}

/** Copias que guarda el Registro (respaldo de descartados y casillas ocupadas); nunca archivos de Expedientes ni de solicitudes. */
export function rutasCopiasCorreo(f: { id: string; adjuntos_respaldo?: unknown; conflictos?: unknown }): string[] {
  const prefijo = `correo-recibido/${f.id}/`;
  const de = (v: unknown) => (Array.isArray(v) ? v : []).map((a: any) => String(a?.storage_path ?? "")).filter((r) => r.startsWith(prefijo));
  return [...new Set([...de(f.adjuntos_respaldo), ...de(f.conflictos)])];
}

/** Casillas ocupadas aún sin decidir. */
export const conflictosPendientes = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((c: any) => c?.estado === "pendiente" && typeof c?.storage_path === "string") as { nombre: string; tipo: string; storage_path: string }[];
