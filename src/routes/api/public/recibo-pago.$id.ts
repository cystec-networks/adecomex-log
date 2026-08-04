import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/recibo-pago/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const parsed = z.string().uuid().safeParse(params.id);
        if (!parsed.success) {
          return Response.json({ error: "No encontrado" }, { status: 404, headers: CORS });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("recibos_pago")
          .select(
            "id, periodo_inicio, periodo_fin, salario_quincena, descuento_prestamo, afp_monto, ars_monto, isr_monto, otros_descuentos, otros_descuentos_concepto, neto_pagado, notas, created_at, empleados:empleado_id(nombre, cedula, cargo)",
          )
          .eq("id", parsed.data)
          .is("deleted_at", null)
          .maybeSingle();

        if (error || !data) {
          return Response.json({ error: "No encontrado" }, { status: 404, headers: CORS });
        }

        return Response.json({ recibo: data }, { headers: CORS });
      },
    },
  },
});
