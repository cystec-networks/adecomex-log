import { createFileRoute } from "@tanstack/react-router";

// Tarea diaria de retención del Registro de correos. La llama la base de datos (pg_cron) con el
// mismo token privado de las tareas programadas; sin token válido no se hace ningún trabajo.
export const Route = createFileRoute("/api/public/correos/retencion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token") ?? "";
        if (token.length < 32 || token.length > 200) return Response.json({ error: "No autorizado" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valido } = await supabaseAdmin.rpc("novedades_token_valido", { p_token: token });
        if (!valido) return Response.json({ error: "No autorizado" }, { status: 401 });
        try {
          const { aplicarRetencionCorreos } = await import("@/lib/correos-retencion.server");
          const r = await aplicarRetencionCorreos(supabaseAdmin);
          return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
        } catch (e) {
          console.error("Retención de correos", e);
          return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
