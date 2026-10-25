/** Deterministic total/currency extraction from a PDF's embedded text layer (primary method before AI). */
export type TotalTexto = { monto: number; moneda: "DOP" | "USD"; etiqueta: string };

const SEP = String.raw`[\s:.\-]*`;
const NUM = String.raw`([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)`;
const NO_SUB = String.raw`(?<!sub[\s\-]*)`;
const DOP = String.raw`(?:DOP\s*\$?|RD\s*\$|\(\s*RD\s*\$\s*\)|\(\s*DOP\s*\))`;
const USD = String.raw`(?:USD\s*\$?|US\s*\$|\(\s*US\s*\$\s*\)|\(\s*USD\s*\))`;
const LABEL = String.raw`(?:monto\s+total|total(?:es)?(?:\s+a\s+pagar|\s+general|\s+amount)?|grand\s+total|amount\s+due|monto)`;

const patrones = (moneda: string, simboloSuelto: boolean) => [
  // Label + currency + number: "Total DOP: 42,480.00", "Monto Total: DOP 43,937.68", "Monto DOP$: 37,170.00", "Totales (US$) 708.00"
  new RegExp(String.raw`\b${NO_SUB}(${LABEL})\s*${SEP}${moneda}${SEP}\$?\s*${NUM}`, "gi"),
  // Label + number + currency: "Total: 42,480.00 DOP"
  new RegExp(String.raw`\b${NO_SUB}(${LABEL})${SEP}${NUM}\s*${moneda}`, "gi"),
  ...(simboloSuelto ? [new RegExp(String.raw`\b${NO_SUB}(monto\s+total|total(?:es)?(?:\s+a\s+pagar)?)${SEP}\$\s*${NUM}`, "gi")] : []),
];

const numero = (s: string) => { const n = Number(s.replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

function ultimo(texto: string, regs: RegExp[]): { monto: number; etiqueta: string } | null {
  let mejor: { idx: number; monto: number; etiqueta: string } | null = null;
  for (const re of regs) for (const m of texto.matchAll(re)) {
    const monto = numero(m[2]);
    if (monto !== null && (!mejor || m.index! > mejor.idx)) mejor = { idx: m.index!, monto, etiqueta: m[0].replace(/\s+/g, " ").trim() };
  }
  return mejor && { monto: mejor.monto, etiqueta: mejor.etiqueta };
}

/** DOP/RD$ totals always win over any US$ total; within a currency the last explicit total in reading order wins. */
export function totalDesdeTexto(texto: string): TotalTexto | null {
  const t = texto.replace(/\u00a0/g, " ");
  const dop = ultimo(t, patrones(DOP, false));
  if (dop) return { ...dop, moneda: "DOP" };
  const usd = ultimo(t, patrones(USD, true));
  return usd ? { ...usd, moneda: "USD" } : null;
}
