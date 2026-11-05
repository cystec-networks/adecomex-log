/** Parse only the quoted Collect section, never a freight/prepaid amount outside it. */
export function leerCollectCharges(texto: unknown): number | null {
  if (typeof texto !== 'string') return null;
  const inicio = /\bCOLLECT\s+CHARGES\b|\bCARGOS\s+A\s+COBRAR\b/i.exec(texto);
  if (!inicio) return null;
  const seccion = texto.slice(inicio.index + inicio[0].length).split(/\bPREPAID\s+CHARGES\b|\bTERMS\s+AND\s+CONDITIONS\b|\bFREIGHT\s+PREPAID\b/i)[0];
  const usdCabecera = /^\s*[:(\-]?\s*(?:USD|US\$|US DOLLARS)\b/i.test(seccion);
  let total = 0, encontrados = 0;
  for (const linea of seccion.split(/\r?\n/)) {
    if (/\b(?:SUB\s*TOTAL|TOTAL|PREPAID)\b/i.test(linea)) continue;
    if (/\b(?:EUR|DOP|RD\$|GBP|CAD)\b/i.test(linea)) continue;
    // A rate is not the charge payable; avoid guessing quantities or multiplying it.
    if (/\bPER\s+(?:CONTAINER|CNTR|TEU)|\/\s*(?:CONTAINER|CNTR|TEU)\b/i.test(linea)) continue;
    const cantidades = [...linea.matchAll(/(?:USD|US\$|US DOLLARS)\s*[:]?\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:USD|US\$|US DOLLARS)/gi)];
    let valor: string | undefined;
    if (cantidades.length === 1) valor = cantidades[0]?.[1] ?? cantidades[0]?.[2];
    else if (!cantidades.length && usdCabecera) valor = /(?:[:\s])([\d,]+\.\d{2})\s*\)?\s*$/.exec(linea)?.[1];
    if (!valor || !/[A-Za-z]/.test(linea)) continue;
    if (!/^\d+(?:\.\d{1,2})?$|^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(valor)) continue;
    const monto = Number(valor.replace(/,/g, ''));
    if (!Number.isFinite(monto) || monto < 0) continue;
    total += Math.round(monto * 100); encontrados++;
  }
  return encontrados ? total / 100 : null;
}
export function sumarOtrosDocumentos(bl: number | null | undefined, factura: number | null | undefined): number | null {
  const montos = [bl, factura].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return montos.length ? montos.reduce((s, v) => s + Math.round(v * 100), 0) / 100 : null;
}