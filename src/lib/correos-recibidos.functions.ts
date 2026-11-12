import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «Crear solicitud» desde el registro: rehace el proceso del correo descartado con su texto y
 * adjuntos guardados, sin volver a descartarlo. Solo personal interno (el registro se lee bajo RLS).
 */
export const crearSolicitudDesdeCorreo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { registroId: string }) => {
    if (!UUID_RE.test(input?.registroId ?? "")) throw new Error("Correo inválido");
    return { registroId: input.registroId };
  })
  .handler(async ({ data, context }) => {
    const { data: fila, error } = await context.supabase.from("correos_recibidos").select("*").eq("id", data.registroId).maybeSingle();
    if (error) throw new Error(`No se pudo leer el correo: ${error.message}`);
    if (!fila) throw new Error("Correo no encontrado o sin permiso para verlo.");
    if (fila.resultado !== "descartada" && fila.resultado !== "error") throw new Error("Solo se puede crear la solicitud de un correo descartado o con error.");

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    // Solicitud descartada desde la bandeja: se restaura la misma (con sus adjuntos), sin duplicar.
    if (fila.adjuntos_borrados_en) throw new Error("Los adjuntos de este correo se borraron al cumplir 30 días como descartado; ya no se puede crear la solicitud.");
    if (fila.solicitud_id) {
      const { data: sol, error: errorSol } = await (admin as any).from("solicitudes_correo").select("id,estado").eq("id", fila.solicitud_id).maybeSingle();
      if (errorSol) throw new Error(`No se pudo leer la solicitud: ${errorSol.message}`);
      if (sol?.estado === "descartada") {
        const { data: restaurada, error: e1 } = await (admin as any).from("solicitudes_correo").update({ estado: "pendiente", motivo_descarte: null })
          .eq("id", sol.id).eq("estado", "descartada").select("id");
        if (e1) throw new Error(`No se pudo restaurar la solicitud: ${e1.message}`);
        if (!restaurada?.length) throw new Error("Otra persona ya restauró esta solicitud.");
        const { error: e2 } = await (admin as any).from("correos_recibidos").update({
          resultado: "creada", motivo: "Solicitud restaurada manualmente desde el registro", reintentable: false,
          recuperado_por: context.userId, recuperado_en: new Date().toISOString(),
        }).eq("id", fila.id);
        if (e2) throw new Error(`La solicitud se restauró, pero no se pudo actualizar el registro: ${e2.message}`);
        return { resultado: "creada", solicitud_id: sol.id as string, expediente_numero: null, advertencias: [] as string[] };
      }
    }
    if (!fila.cuerpo && !fila.asunto) throw new Error("Este correo se recibió antes de que se guardara su texto; quítale la etiqueta «Procesado-Plataforma» en Gmail para que se envíe otra vez.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    // Guarda contra doble clic: solo un intento pasa de «descartada» a «procesando».
    const { data: tomado, error: errorToma } = await db.from("correos_recibidos")
      .update({ resultado: "procesando", ultimo_intento_at: new Date().toISOString() })
      .eq("id", fila.id).eq("resultado", fila.resultado).select("id");
    if (errorToma) throw new Error(`No se pudo preparar el correo: ${errorToma.message}`);
    if (!tomado?.length) throw new Error("Otra persona ya está creando la solicitud de este correo.");
    const restaurar = () => db.from("correos_recibidos").update({ resultado: fila.resultado, motivo: fila.motivo, ultimo_intento_at: fila.ultimo_intento_at }).eq("id", fila.id);

    try {
      const { reconstruirCorreo } = await import("./correos-cola.server");
      const { procesarCorreo } = await import("./correo-procesar.server");
      const r = await procesarCorreo(db, await reconstruirCorreo(db, fila), { registroId: fila.id, forzado: true });
      if (r.tipo === "cola") { await restaurar(); throw new Error(`${r.motivo.split(":")[0]}: la IA está detenida ahora mismo. Inténtalo cuando haya margen.`); }
      if (r.tipo === "fallo") { await restaurar(); throw new Error(r.motivo); }
      const c = r.campos;
      const { error: e } = await db.from("correos_recibidos").update({
        resultado: c.resultado, motivo: (c.motivo?.includes("Creada manualmente") ? c.motivo : `Creada manualmente desde el registro. ${c.motivo ?? ""}`.trim()).slice(0, 1000), reintentable: false,
        solicitud_id: c.solicitud_id ?? null, expediente_id: c.expediente_id ?? null, expediente_numero: c.expediente_numero ?? null,
        vinculo: c.vinculo ?? null, advertencias: (c.advertencias ?? []).slice(0, 50), propuestas: c.propuestas ?? {},
        ...(c.conflictos?.length ? { conflictos: c.conflictos } : {}),
        recuperado_por: context.userId, recuperado_en: new Date().toISOString(),
      }).eq("id", fila.id);
      if (e) throw new Error(`La solicitud se creó, pero no se pudo actualizar el registro: ${e.message}`);
      return { resultado: c.resultado, solicitud_id: c.solicitud_id ?? null, expediente_numero: c.expediente_numero ?? null, advertencias: c.advertencias ?? [] };
    } catch (e) {
      const { data: actual } = await db.from("correos_recibidos").select("resultado").eq("id", fila.id).maybeSingle();
      if (actual?.resultado === "procesando") await restaurar();
      throw e;
    }
  });

/**
 * «Procesar cola ahora»: atiende los correos en cola (orden de llegada) sin esperar a la tarea
 * programada, p. ej. después de subir un límite. Solo personal interno (la cola se lee bajo RLS).
 */
export const procesarColaCorreosAhora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: visibles, error } = await context.supabase.from("correos_recibidos").select("id").not("en_cola_desde", "is", null).limit(1);
    if (error) throw new Error(`No se pudo leer la cola: ${error.message}`);
    if (!visibles?.length) return { procesados: 0, pendientes: 0, pausa: null as string | null, ocupado: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { procesarColaCorreos } = await import("./correos-cola.server");
    const r = await procesarColaCorreos(supabaseAdmin as any, { maximo: 3, msMaximo: 45_000 });
    return { procesados: r.procesados, pendientes: r.pendientes, pausa: r.pausa as string | null, ocupado: !!r.ocupado };
  });

const hoySD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
const nombreArchivo = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ]+/g, "_").slice(-120);

/**
 * PDF recibido cuya casilla del Expediente ya tenía archivo: «reemplazar» lo pone en la casilla
 * (con los permisos de documentos de quien decide); «descartar» lo deja fuera y borra la copia.
 */
export const resolverConflictoCorreo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { registroId: string; ruta: string; accion: "reemplazar" | "descartar" }) => {
    if (!UUID_RE.test(input?.registroId ?? "")) throw new Error("Correo inválido");
    if (typeof input?.ruta !== "string" || !input.ruta.startsWith(`correo-recibido/${input.registroId}/`)) throw new Error("Archivo inválido");
    if (input.accion !== "reemplazar" && input.accion !== "descartar") throw new Error("Acción inválida");
    return { registroId: input.registroId, ruta: input.ruta, accion: input.accion };
  })
  .handler(async ({ data, context }) => {
    const { data: fila, error } = await context.supabase.from("correos_recibidos").select("id,expediente_id,conflictos").eq("id", data.registroId).maybeSingle();
    if (error) throw new Error(`No se pudo leer el correo: ${error.message}`);
    if (!fila) throw new Error("Correo no encontrado o sin permiso para verlo.");
    const lista = (Array.isArray(fila.conflictos) ? fila.conflictos : []) as any[];
    const c = lista.find((x) => x?.storage_path === data.ruta);
    if (!c) throw new Error("Ese archivo ya no está pendiente.");
    if (c.estado !== "pendiente") throw new Error("Otra persona ya decidió sobre este archivo.");
    if (!fila.expediente_id) throw new Error("El correo ya no está vinculado a un Expediente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    if (data.accion === "reemplazar") {
      const destino = `${fila.expediente_id}/${Date.now()}_${nombreArchivo(c.nombre)}`;
      const cp = await context.supabase.storage.from("documentos").copy(c.storage_path, destino);
      if (cp.error) throw new Error(`No tienes permiso para cambiar documentos o el archivo no está disponible: ${cp.error.message}`);
      const { data: actuales, error: e1 } = await context.supabase.from("documentos").select("id").eq("expediente_id", fila.expediente_id).eq("tipo", c.tipo).not("storage_path", "is", null).order("created_at", { ascending: false }).limit(1);
      if (e1) throw new Error(e1.message);
      const cambios = { storage_path: destino, file_hash: c.file_hash ?? null, estado: "recibido" as const, fecha_recepcion: hoySD(), observaciones: `Reemplazado con adjunto de correo: ${c.nombre}`.slice(0, 500) };
      const r = actuales?.length
        ? await context.supabase.from("documentos").update(cambios).eq("id", actuales[0].id).select("id")
        : await context.supabase.from("documentos").insert({ expediente_id: fila.expediente_id, tipo: c.tipo, ...cambios }).select("id");
      if (r.error || !r.data?.length) {
        await admin.storage.from("documentos").remove([destino]);
        throw new Error(r.error ? `No se pudo reemplazar el documento: ${r.error.message}` : "No tienes permiso para cambiar documentos del Expediente.");
      }
    }
    const nuevos = lista.map((x) => x?.storage_path === data.ruta ? { ...x, estado: data.accion === "reemplazar" ? "reemplazado" : "descartado", resuelto_por: context.userId, resuelto_en: new Date().toISOString() } : x);
    const { error: e2 } = await admin.from("correos_recibidos").update({ conflictos: nuevos }).eq("id", fila.id);
    if (e2) throw new Error(`Se aplicó la decisión, pero no se pudo actualizar el registro: ${e2.message}`);
    if (data.accion === "descartar") await admin.storage.from("documentos").remove([c.storage_path]);
    return { ok: true, accion: data.accion };
  });

/** «Quitar del registro»: borra las líneas seleccionadas y sus copias guardadas (nunca los documentos del Expediente). */
export const quitarCorreosDelRegistro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = Array.isArray(input?.ids) ? input.ids.filter((i) => UUID_RE.test(i)) : [];
    if (!ids.length || ids.length > 500) throw new Error("Selecciona entre 1 y 500 correos");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    const { data: borradas, error } = await context.supabase.from("correos_recibidos").delete().in("id", data.ids).select("id,adjuntos_respaldo,conflictos");
    if (error) throw new Error(`No se pudo quitar del registro: ${error.message}`);
    const { rutasCopiasCorreo } = await import("./correos-recibidos");
    const rutas = (borradas ?? []).flatMap((f: any) => rutasCopiasCorreo(f));
    if (rutas.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (let i = 0; i < rutas.length; i += 100) await (supabaseAdmin as any).storage.from("documentos").remove(rutas.slice(i, i + 100));
    }
    return { quitados: borradas?.length ?? 0 };
  });
