export const TIPOS_RESULTADO_DGA = ["Reporte de Liquidación de Impuestos", "PIN de Pago de Impuestos", "Recibo Pago de Impuestos"] as const;
export type TipoResultadoDga = typeof TIPOS_RESULTADO_DGA[number];
export const esDocumentoResultadoDga = (tipo: string): tipo is TipoResultadoDga => TIPOS_RESULTADO_DGA.some((t) => t === tipo);
export type ResultadoDgaExtraido = {
  numero?: string | null; estado?: string | null; pin?: string | null;
  registro?: string | null; termino?: string | null; fecha_pago?: string | null; total?: number | null;
};
export type CamposResultadoDga = Partial<Record<"liq_siga_numero" | "liq_siga_estado" | "liq_siga_pin_pago" | "liq_siga_registro_at" | "liq_siga_termino_at" | "liq_siga_fecha_registro" | "liq_siga_fecha_pago" | "liq_oficial_total", string | number>>;
export const campoDgaVacio = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
function fecha(v: unknown, hora: boolean): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  const check = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== `${y}-${mo}-${d}` || Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  // Las fechas SIGA son locales de República Dominicana, nunca UTC del navegador.
  return hora ? `${y}-${mo}-${d}T${hh}:${mm}:${ss}-04:00` : `${y}-${mo}-${d}`;
}
export function camposDesdeDocumentoDga(tipo: TipoResultadoDga, datos: ResultadoDgaExtraido): CamposResultadoDga {
  const out: CamposResultadoDga = {};
  const texto = (key: keyof CamposResultadoDga, v: unknown) => { if (typeof v === "string" && v.trim()) out[key] = v.trim(); };
  if (tipo === "Reporte de Liquidación de Impuestos") {
    texto("liq_siga_numero", datos.numero); texto("liq_siga_estado", datos.estado);
  } else {
    if (typeof datos.total === "number" && Number.isFinite(datos.total) && datos.total >= 0) out.liq_oficial_total = datos.total;
    if (tipo === "PIN de Pago de Impuestos") {
      texto("liq_siga_pin_pago", datos.pin);
      const registro = fecha(datos.registro, true), termino = fecha(datos.termino, true);
      if (registro) { out.liq_siga_registro_at = registro; out.liq_siga_fecha_registro = registro.slice(0, 10); }
      if (termino) out.liq_siga_termino_at = termino;
    } else {
      const pago = fecha(datos.fecha_pago, false);
      if (pago) out.liq_siga_fecha_pago = pago;
    }
  }
  return out;
}
export function completarResultadoDga(actual: Record<string, unknown>, campos: CamposResultadoDga): CamposResultadoDga {
  return Object.fromEntries(Object.entries(campos).filter(([k]) => campoDgaVacio(actual[k]))) as CamposResultadoDga;
}