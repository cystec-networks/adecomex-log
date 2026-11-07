/**
 * Cálculos del Dashboard General · Importaciones: períodos Semanal/Mensual/Anual,
 * comparación «a la fecha» cuando el período está en curso y agregados por período.
 * Las fechas se manejan como YYYY-MM-DD en hora de Santo Domingo.
 */

export type PeriodoImportaciones = "semanal" | "mensual" | "anual";
export type Rango = { desde: string; hasta: string };

export const KPI_DASH_IMPORTACIONES_IDS = ["importaciones", "facturado", "gastos", "utilidad", "margen"] as const;
export type KpiDashImportacionesId = (typeof KPI_DASH_IMPORTACIONES_IDS)[number];
export const CLAVE_KPI_DASH_IMPORTACIONES = "importaciones-dashboard-kpi-orden";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m0: number, d: number) => {
  const t = new Date(Date.UTC(y, m0, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const partes = (s: string) => ({ y: Number(s.slice(0, 4)), m0: Number(s.slice(5, 7)) - 1, d: Number(s.slice(8, 10)) });
const diasEnMes = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
export function sumarDias(s: string, n: number) {
  const { y, m0, d } = partes(s);
  return iso(y, m0, d + n);
}
const diferenciaDias = (a: string, b: string) => {
  const pa = partes(a), pb = partes(b);
  return Math.round((Date.UTC(pa.y, pa.m0, pa.d) - Date.UTC(pb.y, pb.m0, pb.d)) / 86400000);
};
/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
export function lunesIso(s: string) {
  const { y, m0, d } = partes(s);
  const dia = new Date(Date.UTC(y, m0, d)).getUTCDay();
  return sumarDias(s, dia === 0 ? -6 : 1 - dia);
}

/** Fecha (YYYY-MM-DD) en hora de Santo Domingo de un instante ISO. */
export function fechaSantoDomingo(instante: string | Date | null | undefined): string {
  if (!instante) return "";
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Período elegido y su período anterior equivalente. Si el período está en curso
 * (contiene `hoy`), ambos se recortan al mismo avance: p. ej. 1–7 nov vs 1–7 oct,
 * lunes–miércoles vs lunes–miércoles, 1 ene–7 nov vs 1 ene–7 nov del año anterior.
 * Si el mes anterior es más corto, el corte se ajusta a su último día.
 */
export function periodoComparado(periodo: PeriodoImportaciones, ancla: string, hoy: string): { actual: Rango; previo: Rango; aLaFecha: boolean } {
  let actual: Rango, previo: Rango;
  const { y, m0 } = partes(ancla);
  if (periodo === "semanal") {
    const s = lunesIso(ancla), ps = sumarDias(s, -7);
    actual = { desde: s, hasta: sumarDias(s, 6) };
    previo = { desde: ps, hasta: sumarDias(ps, 6) };
  } else if (periodo === "mensual") {
    actual = { desde: iso(y, m0, 1), hasta: iso(y, m0, diasEnMes(y, m0)) };
    previo = { desde: iso(y, m0 - 1, 1), hasta: iso(y, m0, 0) };
  } else {
    actual = { desde: `${y}-01-01`, hasta: `${y}-12-31` };
    previo = { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
  }
  const aLaFecha = hoy >= actual.desde && hoy < actual.hasta;
  if (!aLaFecha) return { actual, previo, aLaFecha };

  const h = partes(hoy);
  let corte: string;
  if (periodo === "semanal") corte = sumarDias(previo.desde, diferenciaDias(hoy, actual.desde));
  else if (periodo === "mensual") {
    const p = partes(previo.desde);
    corte = iso(p.y, p.m0, Math.min(h.d, diasEnMes(p.y, p.m0)));
  } else corte = iso(y - 1, h.m0, Math.min(h.d, diasEnMes(y - 1, h.m0)));
  return { actual: { desde: actual.desde, hasta: hoy }, previo: { desde: previo.desde, hasta: corte }, aLaFecha };
}

export function semanaIso(s: string) {
  const { y, m0, d } = partes(s);
  const t = new Date(Date.UTC(y, m0, d));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +inicio) / 86400000 + 1) / 7);
}

const mesCorto = (y: number, m0: number, conAnio: boolean) =>
  new Date(Date.UTC(y, m0, 15)).toLocaleDateString("es-DO", { month: "short", ...(conAnio ? { year: "2-digit" } : {}), timeZone: "UTC" });

/**
 * Barras de la gráfica: 12 semanas (Semanal), 12 meses hasta el mes elegido (Mensual)
 * o los 12 meses del año elegido (Anual).
 */
export function cubetasSerie(periodo: PeriodoImportaciones, ancla: string): { label: string; rango: Rango }[] {
  const { y, m0 } = partes(ancla);
  if (periodo === "semanal") {
    const s = lunesIso(ancla);
    return Array.from({ length: 12 }, (_, i) => {
      const ini = sumarDias(s, -7 * (11 - i));
      return { label: `S${semanaIso(ini)}`, rango: { desde: ini, hasta: sumarDias(ini, 6) } };
    });
  }
  if (periodo === "anual") {
    return Array.from({ length: 12 }, (_, m) => ({ label: mesCorto(y, m, false), rango: { desde: iso(y, m, 1), hasta: iso(y, m, diasEnMes(y, m)) } }));
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mm = m0 - (11 - i);
    const p = partes(iso(y, mm, 1));
    return { label: mesCorto(p.y, p.m0, true), rango: { desde: iso(p.y, p.m0, 1), hasta: iso(p.y, p.m0, diasEnMes(p.y, p.m0)) } };
  });
}

export type ExpedienteImportacion = { id: string; created_at: string };
export type ResumenImportaciones = { cantidad: number; facturado: number; gastos: number; utilidad: number; margen: number };

export const enRango = (fecha: string, r: Rango) => !!fecha && fecha >= r.desde && fecha <= r.hasta;

/** Totales de los Expedientes cuya fecha de registro (Santo Domingo) cae en el rango. */
export function resumenImportaciones(
  expedientes: readonly ExpedienteImportacion[],
  facturadoPorExp: ReadonlyMap<string, number>,
  gastosPorExp: ReadonlyMap<string, number>,
  rango: Rango,
): ResumenImportaciones {
  let cantidad = 0, facturado = 0, gastos = 0;
  for (const e of expedientes) {
    if (!enRango(fechaSantoDomingo(e.created_at), rango)) continue;
    cantidad++;
    facturado += facturadoPorExp.get(e.id) ?? 0;
    gastos += gastosPorExp.get(e.id) ?? 0;
  }
  const utilidad = facturado - gastos;
  return { cantidad, facturado, gastos, utilidad, margen: facturado > 0 ? (utilidad / facturado) * 100 : 0 };
}

/** Variación % contra el período anterior; null («sin base») si el anterior es 0. */
export function variacionPct(actual: number, previo: number): number | null {
  if (!previo) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}
