import { createFileRoute } from "@tanstack/react-router";
import { autorizadoWebhook } from "@/lib/webhook-auth";

/** Marca una confirmación de la cola como ya enviada (la llamada es idempotente). */
export const Route = createFileRoute("/api/public/confirmaciones-pendientes/$id/enviado")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!autorizadoWebhook(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data, error } = await db
          .from("confirmaciones_correo")
          .update({ estado: "enviada", enviado_en: new Date().toISOString() })
          .eq("id", params.id)
          .eq("estado", "pendiente")
          .select("id");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (data?.length) return Response.json({ resultado: "enviada", id: params.id });
        const { data: existente } = await db.from("confirmaciones_correo").select("id, estado").eq("id", params.id).maybeSingle();
        if (!existente) return Response.json({ error: "Confirmación no encontrada" }, { status: 404 });
        return Response.json({ resultado: "ya_enviada", id: params.id });
      },
    },
  },
});
