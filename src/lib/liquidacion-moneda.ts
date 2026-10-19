/** Adaptador de pantalla: los cálculos y el guardado de Liquidación conservan US$. */
export function impuestoPantallaRd(valorUsd: number | null, tasa: number): number | null {
  if (valorUsd == null || !Number.isFinite(tasa) || tasa <= 0) return null;
  return Number((valorUsd * tasa).toFixed(2));
}

export function impuestoEditadoUsd(valorRd: string, tasa: number): string | null {
  if (valorRd === "") return "";
  if (!Number.isFinite(tasa) || tasa <= 0) return null;
  const monto = Number(valorRd);
  return Number.isFinite(monto) ? String(monto / tasa) : null;
}