import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ColaDB = Pick<SupabaseClient<Database>, "from">;

/** Never cache the queue, including failures and acknowledgement responses. */
export function respuestaCola(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "x-webhook-secret",
    },
  });
}

export async function listarConfirmacionesPendientes(db: ColaDB) {
  const { data, error } = await db.from("confirmaciones_correo")
    .select("id, id_hilo, para, cc, asunto, cuerpo, expediente_id, created_at")
    .eq("estado", "pendiente").is("enviado_en", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, idHilo: c.id_hilo, para: c.para, cc: c.cc,
    asunto: c.asunto, cuerpo: c.cuerpo, expediente_id: c.expediente_id,
    creada_en: c.created_at,
  }));
}

export async function marcarConfirmacionEnviada(db: ColaDB, id: string) {
  const { data, error } = await db.from("confirmaciones_correo")
    .update({ estado: "enviada", enviado_en: new Date().toISOString() })
    .eq("id", id).eq("estado", "pendiente").is("enviado_en", null)
    .select("id");
  if (error) throw error;
  // Read back the persisted state, not just the HTTP success of the update.
  const { data: existente, error: lecturaError } = await db.from("confirmaciones_correo")
    .select("id, estado, enviado_en").eq("id", id).maybeSingle();
  if (lecturaError) throw lecturaError;
  if (!existente) return respuestaCola({ error: "Confirmación no encontrada" }, 404);
  if (existente.estado !== "enviada" || !existente.enviado_en) {
    return respuestaCola({ error: "No se pudo verificar el estado enviado de la confirmación" }, 409);
  }
  const resultado = data?.length ? "enviada" : "ya_enviada";
  console.info("[confirmaciones-cola] ACK", JSON.stringify({ id, resultado, enviado_en: existente.enviado_en }));
  return respuestaCola({ resultado, id, enviado_en: existente.enviado_en });
}