import { supabase } from "@/integrations/supabase/client";
import { copiarProductos } from "@/lib/copiar-productos";

/**
 * Campos de la relación comercial que sí se copian al duplicar un Expediente.
 * Todo lo específico del embarque real (BL, DUA, fechas, contenedores, montos,
 * vínculos a cotización/orden/solicitud, etc.) queda vacío a propósito.
 */
const CAMPOS_DUPLICABLES = [
  "cliente_id",
  "suplidor",
  "suplidor_rnc",
  "tipo_operacion",
  "tipo_carga",
  "pais_origen",
  "pais_origen_codigo",
  "incoterm",
  "medio_transporte",
  "naviera",
  "puerto_salida",
  "puerto_salida_codigo",
  "puerto_arribo",
  "puerto_arribo_codigo",
  "regimen_aduanero",
  "area_aduanera",
  "area_aduanera_codigo",
] as const;

/**
 * Crea un Expediente nuevo a partir de otro, copiando sólo los datos de la
 * relación comercial y el detalle de mercancía. Devuelve el id del nuevo.
 */
export async function duplicarExpediente(origenId: string): Promise<string> {
  const { data: origen, error: eSel } = await supabase
    .from("expedientes")
    .select("*")
    .eq("id", origenId)
    .maybeSingle();
  if (eSel) throw eSel;
  if (!origen) throw new Error("No se encontró el expediente a duplicar.");

  const payload: Record<string, any> = {};
  for (const c of CAMPOS_DUPLICABLES) payload[c] = (origen as any)[c] ?? null;

  const { data: nuevo, error } = await supabase
    .from("expedientes")
    .insert(payload as any)
    .select("id")
    .single();
  if (error) throw error;

  await copiarProductos({
    origenTabla: "mercancia_items",
    origenCol: "expediente_id",
    origenId,
    destinoTabla: "mercancia_items",
    destinoCol: "expediente_id",
    destinoId: nuevo.id,
  });

  return nuevo.id;
}
