/** Lecturas del expediente: no crea costos ni modifica cobros/reembolsos. */
export function costosAutomaticosLiquidacion(
  transportes: { tipo?: string | null; costo_viaje?: number | string | null; eliminado_en?: string | null }[] = [],
  gastos: { concepto?: string | null; monto?: number | string | null; es_reembolso?: boolean | null; deleted_at?: string | null }[] = [],
) {
  const transporte = transportes.reduce((s, t) =>
    t.tipo === "terrestre" && !t.eliminado_en ? s + (Number(t.costo_viaje) || 0) : s, 0);
  const verificacion = gastos.reduce((s, g) =>
    g.es_reembolso && !g.deleted_at &&
    g.concepto?.trim().toLocaleLowerCase("es") === "gastos de verificación y despacho"
      ? s + (Number(g.monto) || 0) : s, 0);
  return [
    { concepto: "Transporte Terrestre (automático)", monto_real: transporte, moneda: "DOP" },
    { concepto: "Gastos de Verificación y Despacho (automático)", monto_real: verificacion, moneda: "DOP" },
  ];
}