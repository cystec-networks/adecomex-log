// Utilidades de fecha para evitar el desfase UTC/local al mostrar
// campos DATE (`YYYY-MM-DD`) provenientes de Postgres.
//
// Un string `YYYY-MM-DD` se parsea por defecto como UTC medianoche;
// al formatearse en zonas negativas (Rep. Dominicana UTC-4) aparece
// un día menos. Estos helpers lo interpretan como fecha local.

export function parseLocalDate(s: string | null | undefined): Date {
  if (!s) return new Date(NaN);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(s);
}

export function fmtLocalDate(
  s: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
  fallback = "—",
): string {
  if (!s) return fallback;
  const d = parseLocalDate(s);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("es-DO", opts);
}

export function fmtLocalDateShort(s: string | null | undefined, fallback = "—"): string {
  return fmtLocalDate(s, { day: "2-digit", month: "2-digit", year: "2-digit" }, fallback);
}

// Días calendario que faltan para la fecha límite resultante de contar
// `plazoDias` días hábiles (lunes a viernes) desde `fechaInicio`.
// Positivo = aún queda tiempo; 0 = vence hoy; negativo = ya venció.
// No contempla feriados de RD.
export function diasHabilesRestantes(
  fechaInicio: string | null | undefined,
  plazoDias: number,
): number {
  const inicio = parseLocalDate(fechaInicio);
  if (isNaN(inicio.getTime())) return Infinity;
  inicio.setHours(0, 0, 0, 0);
  const cursor = new Date(inicio);
  let dias = 0;
  while (dias < plazoDias) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dias++;
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((cursor.getTime() - hoy.getTime()) / 86400000);
}

// Días HÁBILES que faltan desde hoy hasta la fecha límite resultante de contar
// `plazoDias` días hábiles desde `fechaInicio`.
// Positivo = aún quedan días hábiles; 0 = vence hoy; negativo = vencido.
export function habilesRestantesPlazo(
  fechaInicio: string | null | undefined,
  plazoDias: number,
): number {
  const inicio = parseLocalDate(fechaInicio);
  if (isNaN(inicio.getTime())) return Infinity;
  inicio.setHours(0, 0, 0, 0);
  const limite = new Date(inicio);
  let contados = 0;
  while (contados < plazoDias) {
    limite.setDate(limite.getDate() + 1);
    const dow = limite.getDay();
    if (dow !== 0 && dow !== 6) contados++;
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const signo = limite.getTime() >= hoy.getTime() ? 1 : -1;
  const desde = signo > 0 ? new Date(hoy) : new Date(limite);
  const hasta = signo > 0 ? limite : hoy;
  let habiles = 0;
  const cur = new Date(desde);
  while (cur.getTime() < hasta.getTime()) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) habiles++;
  }
  return signo * habiles;
}

// Días entre hoy (00:00 local) y una fecha `YYYY-MM-DD`. Positivo = futuro.
export function daysFromToday(s: string | null | undefined): number {
  const d = parseLocalDate(s);
  if (isNaN(d.getTime())) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
