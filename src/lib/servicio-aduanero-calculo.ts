export type TarifaServicio = { id: string; tipo_despacho: string; unidad: string; tarifa_usd: number };
export type FilaServicio = { tipo_despacho: string; cantidad: number | string };

export const TOPE_DESPACHO_CONSOLIDADO_USD = 88.24;

/** El catálogo identifica exclusivamente el despacho consolidado importado por kilo con `kg`. */
export function calcularLineaServicio(
  tarifa: TarifaServicio | undefined | null,
  cantidad: number | string | null | undefined,
): { subtotal: number; topeAplicado: boolean } {
  const kilos = Number(cantidad);
  if (!tarifa || !Number.isFinite(kilos) || kilos <= 0) return { subtotal: 0, topeAplicado: false };
  const calculado = Number(tarifa.tarifa_usd) * kilos;
  const topeAplicado = tarifa.unidad === "kg" && calculado > TOPE_DESPACHO_CONSOLIDADO_USD;
  return { subtotal: topeAplicado ? TOPE_DESPACHO_CONSOLIDADO_USD : calculado, topeAplicado };
}

export function calcServicioAduaneroUsd(
  tarifa: TarifaServicio | undefined | null,
  cantidad: number | string | null | undefined,
): number {
  return calcularLineaServicio(tarifa, cantidad).subtotal;
}

export function subtotalFila(fila: FilaServicio, tarifas: TarifaServicio[]): number {
  return calcServicioAduaneroUsd(tarifas.find((t) => t.unidad === fila.tipo_despacho), fila.cantidad);
}

export function totalServicioUsd(filas: FilaServicio[] | null | undefined, tarifas: TarifaServicio[]): number {
  return (filas ?? []).reduce((s, f) => s + subtotalFila(f, tarifas), 0);
}