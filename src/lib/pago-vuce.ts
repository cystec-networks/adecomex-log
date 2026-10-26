import { fechaVuce } from "./permiso-vuce";
import { normalizarPagoPuerto, type PagoPuerto } from "./pago-puerto";
import { totalDesdeTexto } from "./pago-puerto-texto";

export const esPagoVuce = (tipo: string | null | undefined) => tipo === "vuce_pin" || tipo === "vuce_recibo";
export const TIPO_DOCUMENTO_PAGO: Record<string, "contenedor" | "almacenaje" | "cargos_locales" | "vuce_pin" | "vuce_recibo"> = {
  "Recibo Pago de Contenedor": "contenedor", "Factura Pago de Almacenaje": "almacenaje", "Factura Pago Cargos Locales": "cargos_locales",
  "PIN de Pago Permiso VUCE": "vuce_pin", "Recibo Pago Permiso VUCE": "vuce_recibo",
};
export const numeroTramite = (s: unknown) => String(s ?? "").trim().toUpperCase();
export const marcadorPermisoVuce = (numero: string) => `Permiso VUCE: ${numeroTramite(numero)}`;
export function costoDelPermiso<T extends { observaciones?: string | null }>(costos: readonly T[], numero: string): T | undefined {
  return costos.find(c => c.observaciones?.split(" · ").includes(marcadorPermisoVuce(numero)));
}
export const marcadorPinVuce = (pin: string) => `PIN/Referencia: ${pin.trim()}`;
/** Costo VUCE ya guardado con el mismo PIN, aunque aún no tenga trámite vinculado (recibo subido antes que el PIN). */
export function costoPorPinVuce<T extends { observaciones?: string | null }>(costos: readonly T[], pin: string): T | undefined {
  const p = pin.trim();
  if (!p) return undefined;
  return costos.find(c => {
    const partes = c.observaciones?.split(" · ") ?? [];
    return partes.includes(marcadorPinVuce(p)) && partes.some(x => x.startsWith("Permiso VUCE: ") || /^(PIN|Recibo) VUCE SIGA: /.test(x));
  });
}
export function permisoDelCostoVuce(costo?: { observaciones?: string | null }): string {
  return costo?.observaciones?.split(" · ").find(p => p.startsWith("Permiso VUCE: "))?.slice("Permiso VUCE: ".length) ?? "";
}
export function permisosDelDocumento<T extends { numero: string | null }>(permisos: readonly T[], documentos: readonly string[]): T[] {
  return permisos.filter(p => documentos.some(n => numeroTramite(n) === numeroTramite(p.numero)));
}
export function datosCostoVuce(costo?: { monto_real?: unknown; moneda?: unknown; observaciones?: string | null }) {
  const partes = costo?.observaciones?.split(" · ") ?? [];
  const valor = (prefijo: string) => partes.find(p => p.startsWith(prefijo))?.slice(prefijo.length) ?? "";
  return { monto: costo?.monto_real == null ? "" : String(costo.monto_real), moneda: String(costo?.moneda ?? ""), fecha: valor("Fecha de pago: "), referencia: valor("PIN/Referencia: ") };
}
/** PIN supplies amount/reference; receipt fills payment date and only a missing amount. */
export function acumularPagoVuce(tipo: string, nuevo: { monto: string; moneda: string; fecha: string; referencia: string }, previo?: Parameters<typeof datosCostoVuce>[0]) {
  const p = datosCostoVuce(previo);
  const conservarMonto = tipo === "vuce_recibo" && Number(p.monto) > 0;
  return { monto: conservarMonto ? p.monto : nuevo.monto, moneda: conservarMonto ? p.moneda : nuevo.moneda,
    fecha: tipo === "vuce_pin" ? p.fecha : nuevo.fecha || p.fecha,
    referencia: tipo === "vuce_recibo" ? p.referencia || nuevo.referencia : nuevo.referencia || p.referencia };
}
export function observacionesPagoVuce(numero: string, codigo: string, tipo: string, datos: { fecha: string; referencia: string }, anteriores?: string | null) {
  const prefijo = tipo === "vuce_pin" ? "PIN VUCE SIGA: " : "Recibo VUCE SIGA: ";
  const otro = (anteriores?.split(" · ") ?? []).filter(p => /^(PIN|Recibo) VUCE SIGA: /.test(p) && !p.startsWith(prefijo));
  return [datos.fecha && `Fecha de pago: ${datos.fecha}`, datos.referencia && `PIN/Referencia: ${datos.referencia}`, numero.trim() && marcadorPermisoVuce(numero), ...otro, `${prefijo}${codigo}`].filter(Boolean).join(" · ");
}
/** Narrow deterministic parser for VUCE text PDFs; no dates from validity/registration. */
export function leerPagoVuceTexto(text: string): PagoPuerto | null {
  const t = text.replace(/\u00a0/g, " ");
  if (!/VUCE/i.test(t)) return null;
  const pin = /Detalle\s+(?:de\s+)?PIN|No\.?\s*PIN\s*:/i.test(t);
  const recibo = /Detalle\s+(?:de\s+)?Factura|RECIBO/i.test(t);
  if (!pin && !recibo) return null;
  const tipo = pin ? "vuce_pin" : "vuce_recibo";
  // VUCE receipts are always in DOP; when no currency marker sits next to the total, take the last explicit TOTAL line.
  const total = totalDesdeTexto(t) ?? (() => {
    const totales = [...t.matchAll(/\bTOTAL\b[\s:.\-]*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi)];
    const ult = totales.at(-1);
    const monto = ult ? Number(ult[1].replace(/,/g, "")) : NaN;
    return Number.isFinite(monto) && monto > 0 ? { monto, moneda: "DOP" as const, etiqueta: ult![0] } : null;
  })();
  const listado = t.split(/Listado\s+de\s+Facturas/i)[1] ?? "";
  const documentos = [...new Set([...(pin ? listado : t).matchAll(/\bTRM-[\w-]+/gi)].map(m => m[0].toUpperCase()))];
  const esPin = (v: string) => /^(?=.*\d)[A-Z0-9][A-Z0-9-]{5,}$/i.test(v) && (/[A-Z]/i.test(v) || v.replace(/\D/g, "").length >= 10);
  const referenciaRecibo = (() => {
    const i = t.search(/NUMERO\s*\/\s*PIN/i);
    if (i < 0) return null;
    const ventana = t.slice(i, i + 200);
    const directo = ventana.match(/NUMERO\s*\/\s*PIN\s*:?\s*([^,\n]*)/i)?.[1]?.trim() ?? "";
    if (esPin(directo)) return directo.toUpperCase();
    return ventana.match(/\b[A-Z0-9-]{6,}\b/gi)?.map(v => v.toUpperCase()).find(esPin) ?? null;
  })();
  const referencia = pin ? t.match(/No\.?\s*(?:de\s+)?PIN\s*:?\s*([A-Z0-9-]+)/i)?.[1] : referenciaRecibo;
  const fecha = !pin ? fechaVuce(t.match(/(?<![\w])Fecha\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1] ?? "") : null;
  return normalizarPagoPuerto({ tipo, monto: total?.monto ?? null, moneda: total?.moneda ?? null, fecha, referencia, documentos_vuce: documentos, confianza: "alta" });
}