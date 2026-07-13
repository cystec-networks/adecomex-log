export type TipoComprobante = "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45";

export const TIPOS_COMPROBANTE: { value: TipoComprobante; label: string }[] = [
  { value: "31", label: "31 - Crédito Fiscal Electrónico" },
  { value: "32", label: "32 - Consumo Electrónico" },
  { value: "33", label: "33 - Nota de Débito Electrónica" },
  { value: "34", label: "34 - Nota de Crédito Electrónica" },
  { value: "41", label: "41 - Compras Electrónico" },
  { value: "43", label: "43 - Gastos Menores Electrónico" },
  { value: "44", label: "44 - Regímenes Especiales Electrónico" },
  { value: "45", label: "45 - Gubernamental Electrónico" },
];

export const tipoLabel = (t: string | null | undefined) =>
  TIPOS_COMPROBANTE.find((x) => x.value === t)?.label ?? t ?? "—";

export const tipoBadgeClass = (t: string | null | undefined) => {
  const map: Record<string, string> = {
    "31": "bg-blue-50 text-blue-700 border-blue-200",
    "32": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "33": "bg-orange-50 text-orange-700 border-orange-200",
    "34": "bg-red-50 text-red-700 border-red-200",
    "41": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "43": "bg-slate-50 text-slate-700 border-slate-200",
    "44": "bg-purple-50 text-purple-700 border-purple-200",
    "45": "bg-amber-50 text-amber-700 border-amber-200",
  };
  return map[t ?? ""] ?? "bg-muted text-muted-foreground border-transparent";
};

export type LineaInput = {
  cantidad: number;
  descripcion: string;
  unidad: string;
  precio: number;
  itbis: number;
  descuento: number;
  recargo: number;
  gravado: boolean;
};

export function calcLinea(l: LineaInput): number {
  const bruto = (l.cantidad || 0) * (l.precio || 0);
  return Math.max(0, bruto - (l.descuento || 0) + (l.recargo || 0));
}

export function calcTotales(lineas: LineaInput[]) {
  let subtotal_gravado = 0;
  let subtotal_exento = 0;
  let total_itbis = 0;
  for (const l of lineas) {
    const valor = calcLinea(l);
    if (l.gravado) subtotal_gravado += valor;
    else subtotal_exento += valor;
    total_itbis += l.itbis || 0;
  }
  return {
    subtotal_gravado: +subtotal_gravado.toFixed(2),
    subtotal_exento: +subtotal_exento.toFixed(2),
    total_itbis: +total_itbis.toFixed(2),
    monto_total: +(subtotal_gravado + subtotal_exento + total_itbis).toFixed(2),
  };
}

export const fmtRD = (n: number | null | undefined) =>
  `RD$ ${(Number(n) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
