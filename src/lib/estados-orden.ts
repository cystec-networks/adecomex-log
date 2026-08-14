export const ORDEN_ESTADOS = [
  "abierta",
  "en_transito",
  "declarada",
  "impuestos_pagados",
  "despachada",
  "entregada",
] as const;

export type OrdenEstado = (typeof ORDEN_ESTADOS)[number];

export const ORDEN_ESTADO_LABEL: Record<string, string> = {
  abierta: "Abierta",
  en_transito: "En Tránsito",
  declarada: "Declarada",
  impuestos_pagados: "Impuestos Pagados",
  despachada: "Despachada",
  entregada: "Entregada",
};

// Mismo esquema de color por estado usado en el resto del sistema
export const ORDEN_ESTADO_CLASS: Record<string, string> = {
  abierta: "bg-muted text-muted-foreground border-transparent",
  en_transito: "bg-sky-100 text-sky-700 border-sky-200",
  declarada: "bg-indigo-100 text-indigo-700 border-indigo-200",
  impuestos_pagados: "bg-amber-100 text-amber-700 border-amber-200",
  despachada: "bg-lime-100 text-lime-700 border-lime-200",
  entregada: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const ordenEstadoLabel = (e: string | null | undefined) =>
  (e && ORDEN_ESTADO_LABEL[e]) || (e ?? "—");
