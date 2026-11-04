import { supabase } from '@/integrations/supabase/client';
export async function leerFacturasTransporte(ids: string[], transporteId?: string) {
  const {data,error}=await supabase.from('facturas_ecf').select('id,encf,monto_total,fecha_emision,pdf_url,eliminado_en,vinculo_por_linea,facturas_ecf_lineas(transporte_id,valor,itbis)').in('id',ids);
  if(error) throw error;
  return (data??[]).map(f=>({...f,monto_asignado:f.vinculo_por_linea ? f.facturas_ecf_lineas.filter(l=>l.transporte_id===transporteId).reduce((s,l)=>s+Number(l.valor)+Number(l.itbis),0) : null}));
}