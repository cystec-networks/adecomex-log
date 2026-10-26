export type TipoPagoPuerto = "almacenaje" | "contenedor" | "gestion_aduanal" | "cargos_locales" | "vuce_pin" | "vuce_recibo";
export const TIPOS_PAGO_PUERTO = ["almacenaje", "contenedor", "gestion_aduanal", "cargos_locales", "vuce_pin", "vuce_recibo"] as const;
export type PagoPuerto = {
  documentos_vuce?: string[];
  monto_sin_itbis: number | null;
  monto: number | null; moneda: "DOP" | "USD" | null; fecha: string | null;
  referencia: string | null; tipo: TipoPagoPuerto | null; confianza: "alta" | "media" | null;
};
export function normalizarPagoPuerto(value: unknown): PagoPuerto {
  const p = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const texto = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const monto = p.monto === null || p.monto === undefined || p.monto === "" ? NaN : Number(p.monto);
  const base = p.monto_sin_itbis === null || p.monto_sin_itbis === undefined || p.monto_sin_itbis === "" ? NaN : Number(p.monto_sin_itbis);
  const montoSinItbis = Number.isFinite(base) && base >= 0 ? base : null;
  return { documentos_vuce: Array.isArray(p.documentos_vuce) ? [...new Set(p.documentos_vuce.filter((v): v is string => typeof v === "string" && /^TRM-[\w-]+$/i.test(v)).map(v => v.toUpperCase()))] : [], monto_sin_itbis: montoSinItbis, monto: p.tipo === "gestion_aduanal" ? montoSinItbis : Number.isFinite(monto) && monto >= 0 ? monto : null,
    moneda: p.moneda === "DOP" || p.moneda === "USD" ? p.moneda : null,
    fecha: typeof p.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : null,
    referencia: texto(p.referencia), tipo: TIPOS_PAGO_PUERTO.includes(p.tipo as TipoPagoPuerto) ? p.tipo as TipoPagoPuerto : null,
    confianza: p.confianza === "alta" || p.confianza === "media" ? p.confianza : null };
}
export function documentoPagoPuerto(tipo: TipoPagoPuerto) {
  return { almacenaje: "Factura Pago de Almacenaje", contenedor: "Recibo Pago de Contenedor", gestion_aduanal: "PDF de Factura e-CF en Finanzas", cargos_locales: "Factura Pago Cargos Locales", vuce_pin: "PIN de Pago Permiso VUCE", vuce_recibo: "Recibo Pago Permiso VUCE" }[tipo];
}
export function conceptoPagoPuerto(tipo: TipoPagoPuerto, referencia: string) {
  if (tipo === "vuce_pin" || tipo === "vuce_recibo") return "Permiso VUCE";
  if (tipo === "gestion_aduanal") return "Gestión Aduanal";
  if (tipo === "cargos_locales") return "Cargos Locales";
  const prefijo = referencia.trim().match(/^(DPW|DPH)/i)?.[0].toUpperCase();
  return `${tipo === "almacenaje" ? "Almacenaje" : "Depósito de Contenedor"}${prefijo ? ` — ${prefijo}` : ""}`;
}
/** Reconoce el concepto guardado en Costos por tipo de pago, sin exigir texto exacto (acepta sufijos « — DPW» y variantes históricas). */
export function esConceptoPagoPuerto(concepto: unknown, tipo: TipoPagoPuerto): boolean {
  const c = String(concepto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const prefijos: Record<TipoPagoPuerto, string[]> = {
    almacenaje: ["almacenaje"],
    contenedor: ["deposito de contenedor", "demora de contenedor", "pago de contenedor", "contenedor"],
    gestion_aduanal: ["gestion aduanal"],
    cargos_locales: ["cargos locales"],
    vuce_pin: ["permiso vuce"],
    vuce_recibo: ["permiso vuce"],
  };
  return prefijos[tipo].some((p) => c.startsWith(p));
}
export function validarPagoPuerto(p: { tipo: string; monto: string; moneda: string }) {
  if (!TIPOS_PAGO_PUERTO.includes(p.tipo as TipoPagoPuerto)) throw new Error("Selecciona el tipo de pago antes de guardar.");
  if (!p.monto.trim() || !Number.isFinite(Number(p.monto)) || Number(p.monto) <= 0) throw new Error("Confirma un monto pagado mayor que cero.");
  if (p.moneda !== "DOP" && p.moneda !== "USD") throw new Error("Confirma la moneda del pago.");
}
const enCurso = new Set<string>();
export async function guardarPagoExclusivo<T>(id: string, guardar: () => Promise<T>): Promise<T> {
  if (enCurso.has(id)) throw new Error("Ya se está guardando un comprobante para este expediente.");
  enCurso.add(id);
  try { return await guardar(); } finally { enCurso.delete(id); }
}
/** Monta la línea de solo lectura de «Resultado oficial DGA»: monto primero y el resto como detalle. */
export function resumenPagoPuerto(montoReal: unknown, moneda: unknown, observaciones: unknown): { monto: string; detalle: string } {
  const n = montoReal === null || montoReal === undefined || montoReal === "" ? NaN : Number(montoReal);
  const monto = Number.isFinite(n) && n > 0
    ? moneda === "USD" ? `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n)
    : "";
  const detalle = typeof observaciones === "string" && observaciones.trim() ? observaciones.trim().replace(" · Pagado", ", pagado") : "";
  return { monto, detalle };
}