// Reglas compartidas (cliente/servidor) del asistente virtual interno.
// El asistente solo orienta: nunca recibe ni consulta datos reales de la plataforma.
import type { UIMessage } from "ai";

export const ASISTENTE_NOMBRE = "Asistente ADECOMEX";
export const ASISTENTE_CLAVE_SESION = "adecomex.asistente.historial";
/** Turnos (usuario + asistente) que se envían al modelo como contexto. */
export const ASISTENTE_MAX_MENSAJES = 6;
/** Longitud máxima de una pregunta escrita por el usuario. */
export const ASISTENTE_MAX_CARACTERES = 2000;

/**
 * Prepara el historial que viaja al modelo: solo turnos de usuario y asistente,
 * solo partes de texto (sin adjuntos ni herramientas), los últimos N mensajes y
 * cada texto recortado al máximo permitido. Devuelve null si el último turno no
 * es una pregunta del usuario con texto.
 */
export function historialParaModelo(mensajes: unknown): UIMessage[] | null {
  if (!Array.isArray(mensajes)) return null;
  const limpios: UIMessage[] = [];
  for (const m of mensajes as Array<Partial<UIMessage>>) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const texto = (Array.isArray(m.parts) ? m.parts : [])
      .filter((p): p is { type: "text"; text: string } =>
        !!p && (p as { type?: string }).type === "text" && typeof (p as { text?: unknown }).text === "string",
      )
      .map((p) => p.text)
      .join("\n")
      .trim()
      .slice(0, ASISTENTE_MAX_CARACTERES);
    if (!texto) continue;
    limpios.push({
      id: typeof m.id === "string" && m.id ? m.id : `m${limpios.length}`,
      role: m.role,
      parts: [{ type: "text", text: texto }],
    });
  }
  const recortado = limpios.slice(-ASISTENTE_MAX_MENSAJES);
  if (recortado.length === 0 || recortado[recortado.length - 1].role !== "user") return null;
  return recortado;
}

/** Lee el historial guardado en esta pestaña (se borra al cerrar la pestaña o la sesión). */
export function leerHistorialSesion(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.sessionStorage.getItem(ASISTENTE_CLAVE_SESION);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? (datos as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export function guardarHistorialSesion(mensajes: UIMessage[]) {
  if (typeof window === "undefined") return;
  try {
    if (mensajes.length === 0) window.sessionStorage.removeItem(ASISTENTE_CLAVE_SESION);
    else window.sessionStorage.setItem(ASISTENTE_CLAVE_SESION, JSON.stringify(mensajes));
  } catch {
    /* almacenamiento lleno o bloqueado: el chat sigue en memoria */
  }
}

export function borrarHistorialSesion() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ASISTENTE_CLAVE_SESION);
  } catch {
    /* sin acceso a sessionStorage */
  }
}
