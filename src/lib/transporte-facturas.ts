export type FacturaTransporte = { id: string; encf: string; monto_total: number; fecha_emision: string; eliminado_en?: string | null; monto_asignado?: number | null };

export function totalFacturasTransporte(facturas: readonly FacturaTransporte[]) {
  return [...new Map(facturas.filter(f => !f.eliminado_en).map(f => [f.id, f])).values()]
    .reduce((total, f) => total + Math.round(Number(f.monto_asignado ?? f.monto_total) * 100), 0) / 100;
}