export function normalizarMonedaFactura(value: unknown): 'USD' | 'DOP' | 'EUR' | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase();
  if (['USD', 'US$', 'DÓLARES ESTADOUNIDENSES', 'US DOLLARS'].includes(v)) return 'USD';
  if (['DOP', 'RD$', 'PESOS DOMINICANOS'].includes(v)) return 'DOP';
  if (['EUR', '€', 'EUROS'].includes(v)) return 'EUR';
  return null;
}

export function normalizarTotalFactura(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const total = Number(value);
  return Number.isFinite(total) && total >= 0 ? total : null;
}