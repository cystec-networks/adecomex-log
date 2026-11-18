import { supabase } from "@/integrations/supabase/client";
import { resolverCostosGestion } from "./gestion-aduanal-automatica";
import { parteAsignada } from "./factura-ecf-asignacion";

/** All merchandise-cost consumers read the same effective invoice-linked rows. */
export async function leerCostosMercancia(expedienteId: string) {
  const [costos, cobros] = await Promise.all([
    supabase.from("costos_producto").select("*").eq("expediente_id", expedienteId).order("created_at"),
    supabase.from("facturas").select("concepto,deleted_at,estado,factura_ecf_id,facturas_ecf(id,encf,monto_total,subtotal_gravado,subtotal_exento,pdf_url,fecha_emision,eliminado_en,estado,vinculo_por_linea,facturas_ecf_lineas(id,expediente_id,valor,itbis),facturas_ecf_asignaciones(linea_id,expediente_id,transporte_id,monto))").eq("expediente_id", expedienteId),
  ]);
  if (costos.error) throw costos.error;
  if (cobros.error) throw cobros.error;
  return resolverCostosGestion(costos.data ?? [], (cobros.data ?? []).map(c => ({...c,facturas_ecf:c.facturas_ecf ? {...c.facturas_ecf,base_asignada:parteAsignada(c.facturas_ecf,{expedienteId},false)} : null})));
}