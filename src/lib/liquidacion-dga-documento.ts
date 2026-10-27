import { campoDgaVacio, type ResultadoDgaExtraido } from "./resultado-dga-documentos";
import { construirObservaciones, normalizarRemarkSiga, type ObservacionesEstructura } from "./observaciones-expediente";

export type LiquidacionDga = ResultadoDgaExtraido & {
  declaracion?: string | null; fecha_declaracion?: string | null; bl?: string | null;
  llegada?: string | null; puerto?: string | null; puerto_codigo?: string | null;
  peso_neto?: number | null; manifiesto?: string | null; resultado_inspeccion?: string | null;
  impuestos?: number | null; servicio?: number | null; dua?: number | null; observaciones?: string | null;
};
export type CambiosLiquidacion = Partial<Record<"numero_dua" | "fecha_presentacion_real" | "bl_awb" | "fecha_llegada_real" | "puerto_arribo" | "puerto_arribo_codigo" | "liq_dga_manifiesto" | "liq_dga_resultado_inspeccion", string>> & { peso_neto?: number };
const texto = (v: unknown) => typeof v === "string" && !/^(?:[-/\s()]|temporal)*$/i.test(v.trim()) ? v.trim() : null;
export function fechaLiquidacion(v: unknown): string | null {
  const t = texto(v); if (!t) return null;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/) ?? t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export function leerLiquidacionDga(text: string): LiquidacionDga | null {
  if (!/Reporte de Liquidaci[oó]n de Impuestos/i.test(text)) return null;
  const valor = (label: string) => texto(text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:[ \\t]*([^\\n]*)`, "i"))?.[1]);
  const dinero = (label: string) => {
    const raw = valor(label)?.match(/^\$?\s*([\d,]+(?:\.\d+)?)/)?.[1];
    return raw ? Number(raw.replace(/,/g, "")) : null;
  };
  const puerto = valor("Dep[oó]sito de Destino");
  const codigo = puerto?.match(/^\[([^\]]+)\]/)?.[1];
  const obs = text.match(/(?:^|\n)OBSERVACIONES\s*\n([\s\S]*?)(?=\n\s*ITEM\s+ARANCEL)/i)?.[1]?.replace(/^Declaraci[oó]n de Siga Interno\s*\n/i, "").trim();
  const numero = valor("Liquidaci[oó]n")?.match(/^([\w]+-CL\d+-[\w-]+)/i)?.[1] ?? null;
  return { numero, estado: valor("Estado"), declaracion: valor("Declaraci[oó]n")?.replace(/\s*\([^)]*\)\s*$/, "") ?? null,
    fecha_declaracion: fechaLiquidacion(valor("Fecha Decl\\.")), bl: valor("N[uú]mero B/L"), llegada: fechaLiquidacion(valor("Fecha Llegada")),
    puerto: puerto?.replace(/^\[[^\]]+\]\s*/, "") ?? null, puerto_codigo: codigo ?? null,
    peso_neto: dinero("Peso Neto KG"), manifiesto: valor("Manifiesto"), resultado_inspeccion: valor("ResuInsp"),
    impuestos: dinero("Total Impuestos a Pagar"), servicio: dinero("Tasa Servicio Aduanero"), dua: dinero("Declaraci[oó]n [UÚ]nica Aduanera"), observaciones: obs ?? null };
}
export function decidirLiquidacionDga(actual: Record<string, unknown>, datos: LiquidacionDga) {
  const cambios: CambiosLiquidacion = {}; const avisos: string[] = [];
  const completar = (campo: keyof CambiosLiquidacion, valor: string | number | null | undefined, label: string) => {
    if (valor == null || valor === "") return;
    if (campoDgaVacio(actual[campo])) Object.assign(cambios, { [campo]: valor });
    else if (String(actual[campo]) !== String(valor)) avisos.push(`${label}: documento ${valor}; expediente ${actual[campo]}. Se conserva el dato del expediente.`);
  };
  completar("numero_dua", texto(datos.declaracion), "Declaración DUA");
  completar("fecha_presentacion_real", fechaLiquidacion(datos.fecha_declaracion), "Fecha de Presentación");
  completar("bl_awb", texto(datos.bl), "BL/AWB"); completar("fecha_llegada_real", fechaLiquidacion(datos.llegada), "Llegada");
  completar("puerto_arribo", texto(datos.puerto), "Puerto");
  if (!actual.puerto_arribo || normalizarRemarkSiga(String(actual.puerto_arribo)) === normalizarRemarkSiga(datos.puerto)) completar("puerto_arribo_codigo", texto(datos.puerto_codigo), "Código de Puerto");
  if (typeof datos.peso_neto === "number" && Number.isFinite(datos.peso_neto) && datos.peso_neto >= 0) completar("peso_neto", datos.peso_neto, "Peso neto");
  for (const [campo, valor] of [["liq_dga_manifiesto", datos.manifiesto], ["liq_dga_resultado_inspeccion", datos.resultado_inspeccion]] as const) { const v = texto(valor); if (v) cambios[campo] = v; }
  const montos = [datos.impuestos, datos.servicio, datos.dua];
  if (montos.every((m) => typeof m === "number" && Number.isFinite(m)) && !campoDgaVacio(actual.liq_oficial_total)) {
    const suma = montos.reduce<number>((acc, m) => acc + (m ?? 0), 0);
    if (Math.round(suma * 100) !== Math.round(Number(actual.liq_oficial_total) * 100)) avisos.push("Verifica: el total de la Liquidación no coincide con el PIN de pago registrado");
  }
  const generado = construirObservaciones((actual.observaciones_estructura ?? {}) as ObservacionesEstructura, String(actual.factura_comercial ?? ""), String(actual.numero ?? ""));
  if (texto(datos.observaciones) && normalizarRemarkSiga(datos.observaciones) !== normalizarRemarkSiga(generado)) avisos.push("Verifica: las OBSERVACIONES de la Liquidación no coinciden con el texto generado del Expediente.");
  return { cambios, avisos };
}