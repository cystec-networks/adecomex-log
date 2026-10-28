import { createFileRoute } from "@tanstack/react-router";
import { autorizadoWebhook } from "@/lib/webhook-auth";
import { listarConfirmacionesPendientes, respuestaCola } from "@/lib/confirmaciones-cola";

/** Cola de correos de confirmación generados al activar una solicitud por correo, aún no enviados. */
export const Route = createFileRoute("/api/public/confirmaciones-pendientes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!autorizadoWebhook(request)) return respuestaCola({ error: "No autorizado" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const confirmaciones = await listarConfirmacionesPendientes(supabaseAdmin);
          console.info("[confirmaciones-cola] GET", JSON.stringify({ ids: confirmaciones.map((c) => c.id) }));
          return respuestaCola({ confirmaciones });
        } catch (error) {
          console.error("[confirmaciones-cola] GET error", error);
          return respuestaCola({ error: "No se pudo consultar la cola de confirmaciones" }, 500);
        }
      },
    },
  },
});
