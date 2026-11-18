import { supabase } from '@/integrations/supabase/client';
import { parteAsignada } from './factura-ecf-asignacion';
export async function leerFacturasTransporte(ids: string[], transporteId?: string) {
  const {data,error}=await supabase.from('facturas_ecf').select('id,encf,monto_total,fecha_emision,pdf_url,eliminado_en,vinculo_por_linea,facturas_ecf_lineas(id,transporte_id,valor,itbis),facturas_ecf_asignaciones(linea_id,transporte_id,expediente_id,monto)').in('id',ids);
  if(error) throw error;
  // Montos asignados (o renglones antiguos) del Transporte; sin reparto la factura cuenta completa.
  return (data??[]).map(f=>({...f,monto_asignado:transporteId ? parteAsignada(f,{transporteId}) : null}));
}
