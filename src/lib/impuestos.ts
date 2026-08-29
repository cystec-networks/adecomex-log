// --- Utilidades de cálculo de impuestos por línea ---
export type TaxCalc = {
  cifLinea: number;
  gravamen: number;
  selectivo: number;
  itbis: number;
  total: number;
};

export function calcImpuestosLinea(
  fobLinea: number,
  totalFob: number,
  seguro: number,
  flete: number,
  otros: number,
  pctGravamen: number | null | undefined,
  aplicaIsc: boolean | null | undefined,
  pctIsc: number | null | undefined,
  pctItbis: number | null | undefined,
): TaxCalc {
  const share = totalFob > 0 ? fobLinea / totalFob : 0;
  const cifLinea = fobLinea + (seguro + flete + otros) * share;
  const grav = pctGravamen != null ? cifLinea * (Number(pctGravamen) / 100) : 0;
  const isc = aplicaIsc && pctIsc != null ? (cifLinea + grav) * (Number(pctIsc) / 100) : 0;
  const pIt = pctItbis != null ? Number(pctItbis) : 18;
  const itbis = pctItbis != null || pctGravamen != null ? (cifLinea + grav + isc) * (pIt / 100) : 0;
  const total = grav + isc + itbis;
  return { cifLinea, gravamen: grav, selectivo: isc, itbis, total };
}
