import { createFileRoute } from "@tanstack/react-router";
import { claveCorreo, ETIQUETA_ERROR, ETIQUETA_OK } from "@/lib/correo-expediente";
import { textoCola } from "@/lib/correos-cola";
import { causaEntradaCola, cerrarRegistroCorreo, ponerEnCola } from "@/lib/correos-cola.server";
import { autorizadoWebhook } from "@/lib/webhook-auth";
import { fechaCorreoValida } from "@/lib/hito-documentos-auto";
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
          const enCola = intento.resultado === "en_cola";
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, ya_procesado: true, en_cola: enCola || undefined,
            resultado: enCola ? textoCola(intento.cola_causa) : RESULTADO_LEGADO[intento.resultado] ?? intento.resultado,
            id: intento.solicitud_id ?? undefined, expediente: intento.expediente_numero ?? undefined, motivo: intento.motivo ?? "Correo ya procesado anteriormente" });
        }
        if (intento.en_proceso) return error(409, "El mismo correo se está procesando en otro intento", true, { registro_id });

        // Texto completo del correo: permite crear la solicitud más tarde si se descarta.
        const { error: errorTexto } = await db.from("correos_recibidos").update({
          cuerpo: str(normal?.cuerpo).slice(0, 200_000) || null, destinatarios: str(normal?.destinatarios ?? "").slice(0, 2000) || null,
          cc: str(normal?.cc ?? "").slice(0, 2000) || null,
          // Llegada real a Gmail: fija el hito «Documentos digitales recibidos» al confirmar la solicitud.
          fecha_correo: fechaCorreoValida(normal?.fecha ?? normal?.date),
          adjuntos_en_gmail: normal?.adjuntos_en_gmail != null && Number.isFinite(Number(normal?.adjuntos_en_gmail)) ? Number(normal?.adjuntos_en_gmail) : null,
          pdfs_en_gmail: normal?.pdfs_en_gmail != null && Number.isFinite(Number(normal?.pdfs_en_gmail)) ? Number(normal?.pdfs_en_gmail) : null,
        }).eq("id", registro_id);
        if (errorTexto) console.error("No se pudo guardar el texto del correo", registro_id, errorTexto.message);

        const finalizar = (c: CamposBitacora) => cerrarRegistroCorreo(db, registro_id, c);
        const exito = async (c: CamposBitacora, respuesta: Record<string, unknown>) => {
          await finalizar(c);
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, resultado: RESULTADO_LEGADO[c.resultado], motivo: c.motivo ?? undefined, ...respuesta });
        };
        const fallo = async (status: number, motivo: string, reintentar = true, adjuntos_respaldo?: CamposBitacora["adjuntos_respaldo"]) => {
          await finalizar({ resultado: "error", motivo, reintentable: reintentar, adjuntos_respaldo });
          return error(status, motivo, reintentar, { registro_id });
        };

        try {
          // Límite de IA, créditos agotados o correos anteriores esperando: va a la cola, nunca a error.
          const encolarPor = await causaEntradaCola(db, registro_id);
          const r = await procesarCorreo(db, normal, { registroId: registro_id, encolarPor });
          if (r.tipo === "cola") {
            await ponerEnCola(db, registro_id, r);
            return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, en_cola: true, resultado: textoCola(r.causa), motivo: r.motivo });
          }
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
