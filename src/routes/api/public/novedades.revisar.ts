import { createFileRoute } from "@tanstack/react-router";

// Tarea diaria de «Novedades de comercio exterior». La llama la base de datos
// (pg_cron) con un token privado guardado solo en la base; sin token válido no
// se hace ningún trabajo.
export const Route = createFileRoute("/api/public/novedades/revisar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token") ?? "";
        if (token.length < 32 || token.length > 200)
          return Response.json({ error: "No autorizado" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valido } = await supabaseAdmin.rpc("novedades_token_valido", {
          p_token: token,
        });
        if (!valido) return Response.json({ error: "No autorizado" }, { status: 401 });
        const { revisarNovedades } = await import("@/lib/novedades-comercio.server");
        const r = await revisarNovedades(supabaseAdmin, { modo: "cron" });
        return Response.json(
          r.ok
            ? {
                ok: true,
                nuevas: r.nuevas,
                fuentes: r.fuentes.length,
                detenida: r.detenida ?? null,
              }
            : r,
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
