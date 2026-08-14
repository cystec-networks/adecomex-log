export const COTIZACION_ESTADOS = [
  "solicitada",
  "en_proceso",
  "cotizada",
  "aprobada",
  "rechazada",
  "expirada",
] as const;

export type CotizacionEstado = (typeof COTIZACION_ESTADOS)[number];

export const COTIZACION_ESTADO_LABEL: Record<string, string> = {
  solicitada: "Solicitada",
  en_proceso: "En Proceso",
  cotizada: "Cotizada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  expirada: "Expirada",
};

// Mismo esquema de color por estado usado en el resto del sistema
export const COTIZACION_ESTADO_CLASS: Record<string, string> = {
  solicitada: "bg-muted text-muted-foreground border-transparent",
  en_proceso: "bg-primary/10 text-primary border-transparent",
  cotizada: "bg-sky-100 text-sky-700 border-sky-200",
  aprobada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazada: "bg-rose-100 text-rose-700 border-rose-200",
  expirada: "bg-amber-100 text-amber-700 border-amber-200",
};

export const cotizacionEstadoLabel = (e: string | null | undefined) =>
  (e && COTIZACION_ESTADO_LABEL[e]) || (e ?? "—");

export const TIPOS_MERCANCIA = [
  "Cosméticos",
  "Materia prima industrial",
  "Ferretero",
  "Lácteos",
  "Agrícola",
  "Agroquímico",
] as const;
