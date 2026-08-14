import { supabase } from "@/integrations/supabase/client";

const CAMPOS = [
  "codigo_arancelario", "detalle_producto", "unidad_medida", "unidad_codigo",
  "cantidad", "peso", "valor_fob", "product_code", "cod_marca", "marca",
  "cod_modelo", "modelo", "especificaciones", "pct_gravamen", "aplica_isc",
  "pct_isc", "pct_itbis", "estado_producto_codigo",
] as const;

type Origen = "cotizacion_productos" | "orden_productos" | "solicitud_productos";
type Destino = "orden_productos" | "solicitud_productos" | "mercancia_items";

/**
 * Copia las líneas de producto de una entidad a la siguiente en el flujo
 * Cotización → Orden → Solicitud → Expediente. Continúa la numeración de
 * item_no existente en el destino (para consolidaciones).
 */
export async function copiarProductos(opts: {
  origenTabla: Origen;
  origenCol: string;
  origenId: string;
  destinoTabla: Destino;
  destinoCol: string;
  destinoId: string;
}) {
  const { data: filas } = await (supabase.from(opts.origenTabla) as any)
    .select("*")
    .eq(opts.origenCol, opts.origenId)
    .is("deleted_at", null)
    .order("item_no");

  if (!filas || filas.length === 0) return 0;

  const { data: existentes } = await (supabase.from(opts.destinoTabla) as any)
    .select("item_no")
    .eq(opts.destinoCol, opts.destinoId)
    .is("deleted_at", null);

  let next = ((existentes ?? []) as any[]).reduce((m, r) => Math.max(m, r.item_no || 0), 0);

  const payload = (filas as any[]).map((r) => {
    const row: any = { [opts.destinoCol]: opts.destinoId, item_no: ++next };
    for (const c of CAMPOS) row[c] = r[c] ?? null;
    return row;
  });

  const { error } = await (supabase.from(opts.destinoTabla) as any).insert(payload);
  if (error) throw error;
  return payload.length;
}
