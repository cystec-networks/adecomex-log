import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  transportista_nombre: z.string().trim().min(1).max(200),
  transportista_rnc: z.string().trim().max(30).optional().nullable(),
  telefono: z.string().trim().max(30).optional().nullable(),
  monto: z.coerce.number().positive().max(1_000_000_000),
  cantidad_viajes: z.coerce.number().int().min(1).max(10_000).default(1),
  moneda: z.enum(["DOP", "USD"]).default("DOP"),
  referencia_viaje: z.string().trim().max(120).optional().nullable(),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  catalogo_viaje_id: z.string().uuid().optional().nullable(),
});


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/solicitud-pago-transporte")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Solicitud inválida" }, { status: 400, headers: CORS });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Debes indicar el nombre del transportista y un monto mayor a 0." },
            { status: 400, headers: CORS },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("solicitudes_pago_transporte")
          .insert({
            transportista_nombre: parsed.data.transportista_nombre,
            transportista_rnc: parsed.data.transportista_rnc || null,
            telefono: parsed.data.telefono || null,
            monto: parsed.data.monto,
            moneda: parsed.data.moneda,
            referencia_viaje: parsed.data.referencia_viaje || null,
            descripcion: parsed.data.descripcion || null,
            catalogo_viaje_id: parsed.data.catalogo_viaje_id || null,
          })
          .select("numero_control")
          .single();

        if (error) {
          console.error("[solicitud-pago-transporte]", error.message);
          return Response.json({ error: "No se pudo registrar la solicitud." }, { status: 500, headers: CORS });
        }

        return Response.json({ success: true, numero_control: data.numero_control }, { headers: CORS });
      },
    },
  },
});
