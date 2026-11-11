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
      const { bytesABase64 } = await import("./correo-adjunto-lectura.server");
      const respaldo = (Array.isArray(fila.adjuntos_respaldo) ? fila.adjuntos_respaldo : []) as { nombre: string; mime: string; storage_path: string }[];
      const adjuntos = [];
      for (const a of respaldo) {
        const { data: blob, error: e } = await db.storage.from("documentos").download(a.storage_path);
        if (e || !blob) throw new Error(`No se pudo recuperar el adjunto ${a.nombre}: ${e?.message ?? "archivo no encontrado"}`);
        adjuntos.push({ nombre: a.nombre, tipo: a.mime, contenido: bytesABase64(new Uint8Array(await blob.arrayBuffer())) });
      }
      const { procesarCorreo } = await import("./correo-procesar.server");
      const r = await procesarCorreo(db, {
        remitente: fila.remitente, asunto: fila.asunto, cuerpo: fila.cuerpo ?? "", destinatarios: fila.destinatarios ?? undefined,
        cc: fila.cc ?? undefined, id_hilo: fila.id_hilo ?? undefined, adjuntos,
      }, { registroId: fila.id, forzado: true });
      if (r.tipo === "fallo") { await restaurar(); throw new Error(r.motivo); }
      const c = r.campos;
      const { error: e } = await db.from("correos_recibidos").update({
        resultado: c.resultado, motivo: (c.motivo?.includes("Creada manualmente") ? c.motivo : `Creada manualmente desde el registro. ${c.motivo ?? ""}`.trim()).slice(0, 1000), reintentable: false,
        solicitud_id: c.solicitud_id ?? null, expediente_id: c.expediente_id ?? null, expediente_numero: c.expediente_numero ?? null,
        vinculo: c.vinculo ?? null, advertencias: (c.advertencias ?? []).slice(0, 50), propuestas: c.propuestas ?? {},
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
