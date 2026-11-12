import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Tarea programada (cada 15 min): procesa la cola de correos detenidos por la IA (límite diario con
// «Detener» o créditos agotados) en orden de llegada. Solo la llamada autenticada del programador.
export const Route = createFileRoute("/api/public/correos/cola")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denegado = await authenticateCronRequest(request);
        if (denegado) return denegado;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { procesarColaCorreos } = await import("@/lib/correos-cola.server");
          const r = await procesarColaCorreos(supabaseAdmin, { maximo: 3, msMaximo: 70_000 });
          return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
          console.error("Cola de correos", e);
          return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
