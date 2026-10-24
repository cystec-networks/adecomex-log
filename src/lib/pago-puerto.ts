export type TipoPagoPuerto = "almacenaje" | "contenedor";
export type PagoPuerto = {
  monto: number | null; moneda: "DOP" | "USD" | null; fecha: string | null;
  referencia: string | null; tipo: TipoPagoPuerto | null; confianza: "alta" | "media" | null;
};
export function normalizarPagoPuerto(value: unknown): PagoPuerto {
  const p = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const texto = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const monto = p.monto === null || p.monto === undefined || p.monto === "" ? NaN : Number(p.monto);
  return { monto: Number.isFinite(monto) && monto >= 0 ? monto : null,
    moneda: p.moneda === "DOP" || p.moneda === "USD" ? p.moneda : null,
    fecha: typeof p.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : null,
    referencia: texto(p.referencia), tipo: p.tipo === "almacenaje" || p.tipo === "contenedor" ? p.tipo : null,
    confianza: p.confianza === "alta" || p.confianza === "media" ? p.confianza : null };
}
export function documentoPagoPuerto(tipo: TipoPagoPuerto) {
  return tipo === "almacenaje" ? "Factura Pago de Almacenaje" : "Recibo Pago de Contenedor";
}
export function conceptoPagoPuerto(tipo: TipoPagoPuerto, referencia: string) {
  const prefijo = referencia.trim().match(/^(DPW|DPH)/i)?.[0].toUpperCase();
  return `${tipo === "almacenaje" ? "Almacenaje" : "Depósito de Contenedor"}${prefijo ? ` — ${prefijo}` : ""}`;
}
export function validarPagoPuerto(p: { tipo: string; monto: string; moneda: string }) {
  if (p.tipo !== "almacenaje" && p.tipo !== "contenedor") throw new Error("Selecciona Almacenaje o Contenedor antes de guardar.");
  if (!p.monto.trim() || !Number.isFinite(Number(p.monto)) || Number(p.monto) <= 0) throw new Error("Confirma un monto pagado mayor que cero.");
  if (p.moneda !== "DOP" && p.moneda !== "USD") throw new Error("Confirma la moneda del pago.");
}
const enCurso = new Set<string>();
export async function guardarPagoExclusivo<T>(id: string, guardar: () => Promise<T>): Promise<T> {
  if (enCurso.has(id)) throw new Error("Ya se está guardando un comprobante para este expediente.");
  enCurso.add(id);
  try { return await guardar(); } finally { enCurso.delete(id); }
}