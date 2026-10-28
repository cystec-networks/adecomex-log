import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ConfirmacionResumen = { expediente_id: string | null; estado: string; enviado_en: string | null };

export function resumirCorreosPendientes(porConvertir: number, confirmaciones: ConfirmacionResumen[]) {
  const porResponder = new Set(confirmaciones
    .filter((c) => c.expediente_id !== null && c.estado === "pendiente" && c.enviado_en === null)
    .map((c) => c.expediente_id)).size;
  return { porConvertir, porResponder, total: porConvertir + porResponder };
}

/** Browser reads retain the same staff RLS as the inbox and confirmation flow. */
export async function obtenerCorreosPendientes(db: Pick<SupabaseClient<Database>, "from">) {
  const [borradores, confirmaciones] = await Promise.all([
    db.from("solicitudes_correo").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    db.from("confirmaciones_correo")
      .select("expediente_id, estado, enviado_en, expedientes!inner(id)")
      .eq("estado", "pendiente").is("enviado_en", null).is("expedientes.eliminado_en", null),
  ]);
  if (borradores.error) throw borradores.error;
  if (confirmaciones.error) throw confirmaciones.error;
  return resumirCorreosPendientes(borradores.count ?? 0, confirmaciones.data ?? []);
}