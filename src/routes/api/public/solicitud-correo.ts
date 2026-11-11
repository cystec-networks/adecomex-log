import { createFileRoute } from "@tanstack/react-router";
import { claveCorreo, ETIQUETA_ERROR, ETIQUETA_OK } from "@/lib/correo-expediente";
import { autorizadoWebhook } from "@/lib/webhook-auth";
import { correoDe, normalizarDestinatarios, procesarCorreo, RESULTADO_LEGADO, str, type CamposBitacora } from "@/lib/correo-procesar.server";

export const Route = createFileRoute("/api/public/solicitud-correo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const error = (status: number, motivo: string, reintentar: boolean, extra: Record<string, unknown> = {}) =>
          Response.json({ ok: false, resultado: "error", etiqueta: ETIQUETA_ERROR, motivo, error: motivo, reintentar, ...extra }, { status });
        if (!autorizadoWebhook(request)) return error(401, "No autorizado", false);

        let body: unknown;
        try { body = await request.json(); } catch { return error(400, "JSON inválido", false); }
        const normal = normalizarDestinatarios(body) as Record<string, unknown> | undefined;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        // Cada entrega queda registrada antes de procesar; ningún correo puede perderse en silencio.
        const remitenteCrudo = str(normal?.remitente).slice(0, 500);
        const asuntoCrudo = str(normal?.asunto).slice(0, 1000);
        const adjuntosCrudos = Array.isArray(normal?.adjuntos) ? (normal!.adjuntos as any[]) : [];
        const clave = await claveCorreo({
          id_mensaje: str(normal?.id_mensaje).slice(0, 300) || null, remitente: remitenteCrudo, asunto: asuntoCrudo,
          cuerpo: str(normal?.cuerpo), adjuntos: adjuntosCrudos.map((a) => str(a?.nombre ?? a?.name ?? a?.filename)),
        });
        const { data: intento, error: errorIntento } = await db.rpc("registrar_intento_correo", { p: {
          clave, id_mensaje: str(normal?.id_mensaje).slice(0, 300) || null, id_hilo: str(normal?.id_hilo).slice(0, 500) || null,
          remitente: remitenteCrudo, remitente_correo: correoDe(remitenteCrudo), asunto: asuntoCrudo, adjuntos_total: adjuntosCrudos.length,
        } });
        if (errorIntento || !intento?.id) {
          console.error("No se pudo registrar el correo recibido", errorIntento?.message);
          return error(503, "No se pudo registrar el correo en la plataforma", true);
        }
        const registro_id: string = intento.id;
        if (intento.ya_procesado) {
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, ya_procesado: true, resultado: RESULTADO_LEGADO[intento.resultado] ?? intento.resultado,
            id: intento.solicitud_id ?? undefined, expediente: intento.expediente_numero ?? undefined, motivo: intento.motivo ?? "Correo ya procesado anteriormente" });
        }
        if (intento.en_proceso) return error(409, "El mismo correo se está procesando en otro intento", true, { registro_id });

        // Texto completo del correo: permite crear la solicitud más tarde si se descarta.
        const { error: errorTexto } = await db.from("correos_recibidos").update({
          cuerpo: str(normal?.cuerpo).slice(0, 200_000) || null, destinatarios: str(normal?.destinatarios ?? "").slice(0, 2000) || null,
          cc: str(normal?.cc ?? "").slice(0, 2000) || null,
          adjuntos_en_gmail: normal?.adjuntos_en_gmail != null && Number.isFinite(Number(normal?.adjuntos_en_gmail)) ? Number(normal?.adjuntos_en_gmail) : null,
          pdfs_en_gmail: normal?.pdfs_en_gmail != null && Number.isFinite(Number(normal?.pdfs_en_gmail)) ? Number(normal?.pdfs_en_gmail) : null,
        }).eq("id", registro_id);
        if (errorTexto) console.error("No se pudo guardar el texto del correo", registro_id, errorTexto.message);

        const finalizar = async (c: CamposBitacora) => {
          const { error: e } = await db.from("correos_recibidos").update({
            resultado: c.resultado, motivo: c.motivo?.slice(0, 1000) ?? null, reintentable: c.reintentable ?? true,
            solicitud_id: c.solicitud_id ?? null, expediente_id: c.expediente_id ?? null, expediente_numero: c.expediente_numero ?? null,
            vinculo: c.vinculo ?? null, advertencias: (c.advertencias ?? []).slice(0, 50), propuestas: c.propuestas ?? {},
            ...(c.adjuntos_respaldo ? { adjuntos_respaldo: c.adjuntos_respaldo } : {}),
            ...(c.resultado === "error" ? { alerta_vista_en: null, alerta_vista_por: null } : {}),
          }).eq("id", registro_id);
          if (e) console.error("No se pudo cerrar el registro del correo", registro_id, e.message);
        };
        const exito = async (c: CamposBitacora, respuesta: Record<string, unknown>) => {
          await finalizar(c);
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, resultado: RESULTADO_LEGADO[c.resultado], motivo: c.motivo ?? undefined, ...respuesta });
        };
        const fallo = async (status: number, motivo: string, reintentar = true, adjuntos_respaldo?: CamposBitacora["adjuntos_respaldo"]) => {
          await finalizar({ resultado: "error", motivo, reintentable: reintentar, adjuntos_respaldo });
          return error(status, motivo, reintentar, { registro_id });
        };

        try {
          const r = await procesarCorreo(db, normal, { registroId: registro_id });
          if (r.tipo === "fallo") return await fallo(r.status, r.motivo, r.reintentar, r.adjuntos_respaldo);
          return await exito(r.campos, r.respuesta);
        } catch (e: any) {
          console.error("Error procesando correo", registro_id, e?.message ?? e);
          return await fallo(500, String(e?.message ?? e).slice(0, 500) || "Error inesperado");
        }
      },
    },
  },
});
