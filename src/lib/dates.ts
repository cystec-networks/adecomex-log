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

// Días entre hoy (00:00 local) y una fecha `YYYY-MM-DD`. Positivo = futuro.
export function daysFromToday(s: string | null | undefined): number {
  const d = parseLocalDate(s);
  if (isNaN(d.getTime())) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
