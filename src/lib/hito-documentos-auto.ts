/**
 * Hito «Documentos digitales recibidos»: los triggers `hito_documentos_por_solicitud` y
 * `hito_documentos_por_carga` lo llenan solos (correo original o primera carga de documentos),
 * solo la primera vez y nunca sobre una fecha manual. Aquí viven las reglas de presentación y
 * la validación de la fecha real que envía el script de Gmail.
 */
import { fmtFechaHora } from "@/lib/documento-versiones";

export const HITO_DOCUMENTOS_RECIBIDOS = "documentos_recibidos";

export type OrigenAutoHito = "correo" | "documentos" | "manual" | null;

type HitoAuto = { auto_origen?: string | null; auto_fecha?: string | null };

/** Muestra la etiqueta «Automático» solo cuando la fecha la puso el sistema. */
export function esHitoAutomatico(h: HitoAuto): boolean {
  return (h.auto_origen === "correo" || h.auto_origen === "documentos") && !!h.auto_fecha;
}

/** Texto principal de la etiqueta al pasar el mouse. */
export function textoHitoAutomatico(h: HitoAuto): string {
  if (h.auto_origen === "correo") return `Correo recibido el ${fmtFechaHora(h.auto_fecha)}`;
  if (h.auto_origen === "documentos") return `Primera carga de documentos el ${fmtFechaHora(h.auto_fecha)}`;
  return "";
}

/** Al editar la fecha a mano, el hito deja de ser automático y nunca se vuelve a llenar solo. */
export const PARCHE_EDICION_MANUAL = {
  auto_origen: "manual",
  auto_fecha: null,
  auto_correo_id: null,
  auto_solicitud_id: null,
} as const;

const MIN_FECHA = Date.UTC(2000, 0, 1);
const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;

/** Fecha del correo enviada por el script (ISO). Descarta valores ilegibles, absurdos o del futuro. */
export function fechaCorreoValida(valor: unknown, ahora = Date.now()): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const t = new Date(valor.trim()).getTime();
  if (!Number.isFinite(t) || t < MIN_FECHA || t > ahora + TOLERANCIA_FUTURO_MS) return null;
  return new Date(t).toISOString();
}
