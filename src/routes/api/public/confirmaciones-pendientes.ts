import { createFileRoute } from "@tanstack/react-router";
import { autorizadoWebhook } from "@/lib/webhook-auth";

/** Cola de correos de confirmación generados al activar una solicitud por correo, aún no enviados. */
export const Route = createFileRoute("/api/public/confirmaciones-pendientes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!autorizadoWebhook(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("confirmaciones_correo")
          .select("id, id_hilo, para, cc, asunto, cuerpo, expediente_id, created_at")
          .eq("estado", "pendiente")
          .order("created_at", { ascending: true });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({
          confirmaciones: (data ?? []).map((c: any) => ({
            id: c.id,
            idHilo: c.id_hilo,
            para: c.para,
            cc: c.cc,
            asunto: c.asunto,
            cuerpo: c.cuerpo,
            expediente_id: c.expediente_id,
            creada_en: c.created_at,
          })),
        });
      },
    },
  },
});
