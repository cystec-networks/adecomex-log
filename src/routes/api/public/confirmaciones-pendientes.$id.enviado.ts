import { createFileRoute } from "@tanstack/react-router";
import { autorizadoWebhook } from "@/lib/webhook-auth";
import { z } from "zod";
import { marcarConfirmacionEnviada, respuestaCola } from "@/lib/confirmaciones-cola";

/** Marca una confirmación de la cola como ya enviada (la llamada es idempotente). */
export const Route = createFileRoute("/api/public/confirmaciones-pendientes/$id/enviado")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!autorizadoWebhook(request)) return respuestaCola({ error: "No autorizado" }, 401);
        const id = z.string().uuid().safeParse(params.id);
        if (!id.success) return respuestaCola({ error: "Identificador inválido" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          return await marcarConfirmacionEnviada(supabaseAdmin, id.data);
        } catch (error) {
          console.error("[confirmaciones-cola] ACK error", { id: id.data, error });
          return respuestaCola({ error: "No se pudo guardar o verificar la confirmación enviada" }, 500);
        }
      },
    },
  },
});
