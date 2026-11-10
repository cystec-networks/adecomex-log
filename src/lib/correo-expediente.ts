/**
 * Relación de un correo entrante con un Expediente existente: número de Expediente
 * (AAAAMM + I/E + secuencia) en asunto o cuerpo, BL normalizado como respaldo,
 * comprobación del remitente y datos faltantes propuestos sin sobrescribir.
 */

const RE_NUMERO = /(?<!\d)(20\d{2}(?:0[1-9]|1[0-2]))\s?([IE])\s?(\d{1,6})(?!\d)/gi;

/** Números de Expediente presentes en el texto, normalizados (202610I358) y sin repetir. */
export function extraerNumerosExpediente(texto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const m of (texto ?? "").matchAll(RE_NUMERO)) vistos.add(`${m[1]}${m[2].toUpperCase()}${m[3]}`);
  return [...vistos];
}

/** Busca primero en el asunto; solo si no hay, en el mensaje nuevo y luego en el correo completo. */
export function numerosExpedienteCorreo(asunto: string, mensaje: string, cuerpo: string): { numeros: string[]; origen: "asunto" | "cuerpo" | null } {
  const enAsunto = extraerNumerosExpediente(asunto);
  if (enAsunto.length) return { numeros: enAsunto, origen: "asunto" };
  const enMensaje = extraerNumerosExpediente(mensaje);
  if (enMensaje.length) return { numeros: enMensaje, origen: "cuerpo" };
  const enCuerpo = extraerNumerosExpediente(cuerpo);
  return enCuerpo.length ? { numeros: enCuerpo, origen: "cuerpo" } : { numeros: [], origen: null };
}

/** BL/AWB comparable: mayúsculas sin espacios ni separadores. */
export const normalizarBl = (bl: string | null | undefined) => (bl ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Número de trámite VUCE (TRM-1026-2551297). */
export function extraerNumeroVuce(texto: string | null | undefined): string | null {
  return /\bTRM-\d{4}-\d{5,8}\b/i.exec(texto ?? "")?.[0]?.toUpperCase() ?? null;
}

export const DOMINIOS_PUBLICOS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "msn.com",
  "yahoo.com", "yahoo.es", "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me",
]);

/** Direcciones de correo contenidas en un texto (campos con varias separadas por coma, punto y coma o espacios). */
export function correosDeTexto(texto: string | null | undefined): string[] {
  return [...new Set((texto ?? "").match(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[a-z]{2,}/gi)?.map((c) => c.toLowerCase()) ?? [])];
}

const dominio = (c: string) => c.split("@")[1] ?? "";

export type CorrespondenciaRemitente = { corresponde: boolean; motivo: string };

/**
 * El remitente corresponde si es una dirección conocida del cliente (o del endosatario, o que ya
 * escribió sobre ese Expediente), comparte su dominio corporativo, o es personal interno.
 */
export function remitenteCorresponde(remitente: string | null, conocidos: string[], internos: string[]): CorrespondenciaRemitente {
  const r = (remitente ?? "").toLowerCase();
  if (!r) return { corresponde: false, motivo: "no se pudo leer la dirección del remitente" };
  const d = dominio(r);
  const corporativo = d && !DOMINIOS_PUBLICOS.has(d);
  if (conocidos.includes(r)) return { corresponde: true, motivo: "dirección registrada del cliente" };
  if (internos.includes(r)) return { corresponde: true, motivo: "personal interno" };
  if (corporativo && conocidos.some((c) => dominio(c) === d)) return { corresponde: true, motivo: "mismo dominio del cliente" };
  if (corporativo && internos.some((c) => dominio(c) === d)) return { corresponde: true, motivo: "dominio interno" };
  return { corresponde: false, motivo: conocidos.length ? "el remitente no coincide con los correos del cliente" : "el cliente no tiene correo registrado para comparar" };
}

export type CampoPropuesto = "bl_awb" | "numero_vuce" | "fecha_llegada_real";
export type PropuestaCampo = { valor: string; etiqueta: string; origen: string; estado: "pendiente" | "aplicada" | "descartada" };
export type Propuestas = Partial<Record<CampoPropuesto, PropuestaCampo>>;

export const ETIQUETA_CAMPO: Record<CampoPropuesto, string> = {
  bl_awb: "BL/AWB",
  numero_vuce: "Número de permiso VUCE",
  fecha_llegada_real: "Fecha de llegada",
};

const vacio = (v: unknown) => v == null || String(v).trim() === "";

/**
 * Solo propone lo que falta en el Expediente; si ya tiene otro valor, avisa sin tocarlo.
 * Una ETA solo se propone como llegada cuando ya pasó (nunca una fecha futura como llegada real).
 */
export function propuestasParaExpediente(
  exp: { bl_awb?: string | null; numero_vuce?: string | null; fecha_llegada_real?: string | null },
  correo: { bl_awb?: string | null; numero_vuce?: string | null; eta?: string | null },
  hoy: string,
): { propuestas: Propuestas; advertencias: string[] } {
  const propuestas: Propuestas = {};
  const advertencias: string[] = [];
  if (correo.bl_awb) {
    if (vacio(exp.bl_awb)) propuestas.bl_awb = { valor: correo.bl_awb.trim().toUpperCase(), etiqueta: ETIQUETA_CAMPO.bl_awb, origen: "correo/adjuntos", estado: "pendiente" };
    else if (normalizarBl(exp.bl_awb) !== normalizarBl(correo.bl_awb)) advertencias.push(`El correo indica BL/AWB ${correo.bl_awb}, distinto del registrado (${exp.bl_awb}); no se cambió.`);
  }
  if (correo.numero_vuce) {
    if (vacio(exp.numero_vuce)) propuestas.numero_vuce = { valor: correo.numero_vuce, etiqueta: ETIQUETA_CAMPO.numero_vuce, origen: "asunto/cuerpo", estado: "pendiente" };
    else if (exp.numero_vuce!.trim().toUpperCase() !== correo.numero_vuce.toUpperCase()) advertencias.push(`El correo menciona el permiso ${correo.numero_vuce}, distinto del registrado (${exp.numero_vuce}); no se cambió.`);
  }
  if (correo.eta && vacio(exp.fecha_llegada_real) && correo.eta <= hoy) {
    propuestas.fecha_llegada_real = { valor: correo.eta, etiqueta: ETIQUETA_CAMPO.fecha_llegada_real, origen: "ETA indicada en el correo", estado: "pendiente" };
  }
  return { propuestas, advertencias };
}

export const propuestasPendientes = (p: unknown): [CampoPropuesto, PropuestaCampo][] =>
  Object.entries((p && typeof p === "object" ? p : {}) as Propuestas).filter(([, v]) => v?.estado === "pendiente") as [CampoPropuesto, PropuestaCampo][];

const RE_IMPORTACION = /\b(DOCUMENTOS?|DOCS?|IMPORTACI[OÓ]N(?:ES)?|VUCE|TRM-\d|EMBARQUES?|DESPACHO|BL|AWB|B\/L|CONTENEDOR(?:ES)?|CONT\.?|FACTURA|PACKING)\b/i;
const MIME_DOCUMENTO = /^(application\/pdf|image\/)/i;

/**
 * Un correo con documentos de importación adjuntos no se descarta solo porque la IA lo crea
 * seguimiento: con palabras de importación en el asunto o de un cliente registrado se registra.
 */
export function conservarPorDocumentos(asunto: string, mimes: string[], remitenteEsCliente: boolean): boolean {
  if (!mimes.some((m) => MIME_DOCUMENTO.test(m))) return false;
  return remitenteEsCliente || RE_IMPORTACION.test(asunto ?? "");
}

async function sha256Hex(texto: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identidad estable del correo: id de mensaje de Gmail, o huella de remitente/asunto/cuerpo/adjuntos. */
export async function claveCorreo(c: { id_mensaje?: string | null; remitente: string; asunto: string; cuerpo: string; adjuntos: string[] }) {
  if (c.id_mensaje?.trim()) return `gmail:${c.id_mensaje.trim()}`;
  return `huella:${await sha256Hex([c.remitente.trim().toLowerCase(), c.asunto.trim(), c.cuerpo.slice(0, 20000), ...[...c.adjuntos].sort()].join("\u0001"))}`;
}

export const ETIQUETA_OK = "Procesado-Plataforma";
export const ETIQUETA_ERROR = "Error-Plataforma";

/** Minutos tras los que un correo «procesando» sin final se considera perdido y se alerta. */
export const MINUTOS_PROCESANDO_ATASCADO = 10;
