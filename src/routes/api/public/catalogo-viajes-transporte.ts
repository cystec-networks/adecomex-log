import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/catalogo-viajes-transporte")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("catalogo_viajes_transporte")
          .select("id, origen, destino, tipo_servicio, precio, moneda")
          .eq("activo", true)
          .order("origen", { ascending: true });

        if (error) {
          return Response.json({ viajes: [] }, { headers: CORS });
        }
        return Response.json({ viajes: data ?? [] }, { headers: CORS });
      },
    },
  },
});
