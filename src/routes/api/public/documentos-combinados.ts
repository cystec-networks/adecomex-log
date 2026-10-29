import { createFileRoute } from "@tanstack/react-router";
import { autorizadoWebhook } from "@/lib/webhook-auth";

/** Procesador en segundo plano de PDFs combinados; lo despierta la base de datos al encolar. */
export const Route = createFileRoute("/api/public/documentos-combinados")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const token = request.headers.get("x-tarea-token") ?? "";
        let ok = autorizadoWebhook(request);
        if (!ok && token) {
          const { data } = await db.rpc("validar_token_tarea", { p_nombre: "documentos_combinados", p_token: token });
          ok = data === true;
        }
        if (!ok) return Response.json({ error: "No autorizado" }, { status: 401 });
        let id: string | null = null;
        try { const b = await request.json(); id = typeof b?.id === "string" ? b.id : null; } catch { /* sin cuerpo */ }
        const { procesarCola } = await import("@/lib/correo-documento-combinado.server");
        try {
          return Response.json({ procesados: await procesarCola(db, { id, max: id ? 1 : 2 }) }, { headers: { "Cache-Control": "no-store" } });
        } catch (e: any) {
          return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});
