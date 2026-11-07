import type { SupabaseClient } from "@supabase/supabase-js";

/** Identificadores estables de las tarjetas KPI del Panel de operaciones, en su orden por defecto. */
export const KPI_PANEL_IDS = [
  "correos",
  "pagos-transportista",
  "logistica",
  "expedientes-transito",
  "expedientes-por-llegar",
  "permisos-vuce",
  "transportes",
  "alertas",
] as const;

export type KpiPanelId = (typeof KPI_PANEL_IDS)[number];

/** Clave en `preferencias_usuario` (una fila por usuario, protegida por RLS). */
export const CLAVE_ORDEN_KPI_PANEL = "panel-operaciones-kpi-orden";

const VALIDOS = new Set<string>(KPI_PANEL_IDS);

/**
 * Convierte un valor guardado en un orden completo y válido: descarta ids
 * desconocidos o repetidos y agrega al final (en su orden por defecto) las
 * tarjetas que falten, p. ej. cuando se incorpora un KPI nuevo.
 */
export function normalizarOrdenKpi(valor: unknown): KpiPanelId[] {
  const resultado: KpiPanelId[] = [];
  if (Array.isArray(valor)) {
    for (const id of valor) {
      if (typeof id === "string" && VALIDOS.has(id) && !resultado.includes(id as KpiPanelId)) {
        resultado.push(id as KpiPanelId);
      }
    }
  }
  for (const id of KPI_PANEL_IDS) if (!resultado.includes(id)) resultado.push(id);
  return resultado;
}

/** Mueve la tarjeta `activo` a la posición que ocupa `destino`. Sin cambios si alguno no existe. */
export function moverKpi(orden: KpiPanelId[], activo: string, destino: string): KpiPanelId[] {
  const desde = orden.indexOf(activo as KpiPanelId);
  const hasta = orden.indexOf(destino as KpiPanelId);
  if (desde < 0 || hasta < 0 || desde === hasta) return orden;
  const copia = [...orden];
  const [item] = copia.splice(desde, 1);
  copia.splice(hasta, 0, item);
  return copia;
}

export function esOrdenPorDefecto(orden: readonly string[]): boolean {
  return orden.length === KPI_PANEL_IDS.length && orden.every((id, i) => id === KPI_PANEL_IDS[i]);
}

export async function leerOrdenKpi(supabase: SupabaseClient<any>, userId: string): Promise<KpiPanelId[]> {
  const { data, error } = await supabase
    .from("preferencias_usuario")
    .select("valor")
    .eq("user_id", userId)
    .eq("clave", CLAVE_ORDEN_KPI_PANEL)
    .maybeSingle();
  if (error) throw error;
  return normalizarOrdenKpi(data?.valor);
}

export async function guardarOrdenKpi(supabase: SupabaseClient<any>, userId: string, orden: KpiPanelId[]): Promise<void> {
  const { error } = await supabase
    .from("preferencias_usuario")
    .upsert({ user_id: userId, clave: CLAVE_ORDEN_KPI_PANEL, valor: normalizarOrdenKpi(orden) }, { onConflict: "user_id,clave" });
  if (error) throw error;
}
