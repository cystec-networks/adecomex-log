/**
 * Hito «Documentos digitales recibidos»: los triggers `hito_documentos_por_solicitud` y
 * `hito_documentos_por_carga` lo llenan solos (correo original o primera carga de documentos),
 * solo la primera vez y nunca sobre una fecha manual. Aquí viven las reglas de presentación y
 * la validación de la fecha real que envía el script de Gmail.
 */
export { esHitoAutomatico, textoHitoAutomatico, PARCHE_EDICION_MANUAL } from "@/lib/hitos-automaticos";

export const HITO_DOCUMENTOS_RECIBIDOS = "documentos_recibidos";

export type OrigenAutoHito = "correo" | "documentos" | "manual" | null;

const MIN_FECHA = Date.UTC(2000, 0, 1);
const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;

/** Fecha del correo enviada por el script (ISO). Descarta valores ilegibles, absurdos o del futuro. */
export function fechaCorreoValida(valor: unknown, ahora = Date.now()): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const t = new Date(valor.trim()).getTime();
  if (!Number.isFinite(t) || t < MIN_FECHA || t > ahora + TOLERANCIA_FUTURO_MS) return null;
  return new Date(t).toISOString();
}
