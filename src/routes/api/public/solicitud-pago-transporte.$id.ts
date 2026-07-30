import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/solicitud-pago-transporte/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const parsed = z.string().uuid().safeParse(params.id);
        if (!parsed.success) {
          return Response.json({ error: "No encontrada" }, { status: 404, headers: CORS });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("solicitudes_pago_transporte")
          .select(
            "numero_control, transportista_nombre, transportista_rnc, telefono, referencia_viaje, placa_contenedor, cantidad_viajes, monto, moneda, descripcion, created_at",
          )
          .eq("id", parsed.data)
          .maybeSingle();

        if (error || !data) {
          return Response.json({ error: "No encontrada" }, { status: 404, headers: CORS });
        }

        return Response.json({ solicitud: data }, { headers: CORS });
      },
    },
  },
});
