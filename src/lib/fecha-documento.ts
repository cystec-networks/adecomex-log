/**
 * Fechas impresas en documentos de importación (BL, AWB, factura).
 * Regla fija confirmada por el usuario: una fecha numérica se lee SIEMPRE como
 * día/mes/año (03/11/2026 = 3 de noviembre de 2026), nunca mes/día.
 * Si la fecha literal no cabe en día/mes/año, se devuelve null: nunca se inventa.
 */

const MESES: Record<string, number> = {
  JAN: 1, ENE: 1, FEB: 2, MAR: 3, APR: 4, ABR: 4, MAY: 5, JUN: 6, JUL: 7,
  AUG: 8, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DEC: 12, DIC: 12,
};

const anio = (v: string): number => (v.length === 2 ? 2000 + Number(v) : Number(v));

function armar(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dias) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Convierte la fecha tal como aparece impresa a AAAA-MM-DD (día/mes/año en las numéricas). */
export function fechaDocumentoIso(literal: unknown): string | null {
  if (typeof literal !== "string") return null;
  const s = literal
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\bDE(L)?\b/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Año primero (2026-11-03): no hay ambigüedad.
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return armar(Number(m[1]), Number(m[2]), Number(m[3]));
  // Numérica: siempre día/mes/año.
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/);
  if (m) return armar(anio(m[3]), Number(m[2]), Number(m[1]));
  // Día y mes con nombre: 03 NOV 2026, 3-Nov-26, 03 de noviembre de 2026.
  m = s.match(/\b(\d{1,2})[-/. ]*([A-Z]{3,})\.?[-/., ]*(\d{4}|\d{2})\b/);
  if (m && MESES[m[2].slice(0, 3)]) return armar(anio(m[3]), MESES[m[2].slice(0, 3)], Number(m[1]));
  // Mes con nombre primero: NOV 3, 2026.
  m = s.match(/\b([A-Z]{3,})\.?[-/ ]*(\d{1,2}),?[-/ ]*(\d{4})\b/);
  if (m && MESES[m[1].slice(0, 3)]) return armar(Number(m[3]), MESES[m[1].slice(0, 3)], Number(m[2]));
  return null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Corrige `fecha_cargado` y `eta` con la copia literal impresa (`*_texto`), que el lector pide junto
 * a cada fecha. Con copia literal manda la regla día/mes/año; si no se puede leer, queda null.
 * Sin copia literal se conserva la fecha ISO del lector solo si es una fecha válida.
 */
export function normalizarFechasLectura<T extends Record<string, any>>(p: T): T {
  if (!p || typeof p !== "object") return p;
  const out: Record<string, any> = { ...p };
  for (const [campo, literal] of [["fecha_cargado", "fecha_cargado_texto"], ["eta", "eta_texto"]] as const) {
    const lit = typeof out[literal] === "string" ? out[literal].trim() : "";
    if (lit) {
      out[campo] = fechaDocumentoIso(lit);
    } else if (out[campo] != null) {
      const v = String(out[campo]).trim();
      out[campo] = ISO.test(v) ? armar(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10))) : fechaDocumentoIso(v);
    }
  }
  return out as T;
}
