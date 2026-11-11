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

/** Solo los PDF cuentan: imágenes, capturas, logos de firma y archivos de ofimática se ignoran. */
export function esPdfAdjunto(a: { nombre?: string | null; mime?: string | null }): boolean {
  return /^application\/pdf\b/i.test(a.mime ?? "") || /\.pdf\s*$/i.test(a.nombre ?? "");
}

/**
 * Documento de importación = PDF clasificado en uno de los tipos definidos (factura comercial,
 * packing list, BL, certificados, permiso VUCE…). «Otros documentos» no cuenta. Un PDF largo que
 * se separará por tipo en segundo plano cuenta, porque son juegos de documentos del embarque.
 */
export function esDocumentoImportacion(a: { tipo?: string | null; combinado?: unknown }, tipos: readonly string[]): boolean {
  return !!a.combinado || (!!a.tipo && tipos.includes(a.tipo));
}

/** Normaliza lo escrito en el catálogo: «@Banco.com.do», «https://www.banco.com.do» → «banco.com.do»; dirección completa se conserva. */
export function normalizarPatronRemitente(v: string): string | null {
  let p = (v ?? "").trim().toLowerCase().replace(/^mailto:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (p.startsWith("@")) p = p.slice(1);
  if (!p.includes("@")) p = p.replace(/^www\./, "");
  return /^([a-z0-9._%+-]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(p) ? p : null;
}

/** Patrón del catálogo «Remitentes ignorados» que coincide (dominio y subdominios, o dirección exacta). */
export function remitenteIgnorado(correo: string | null | undefined, patrones: string[]): string | null {
  const c = (correo ?? "").trim().toLowerCase();
  if (!c.includes("@")) return null;
  const d = dominio(c);
  for (const raw of patrones) {
    const p = raw.trim().toLowerCase();
    if (!p) continue;
    if (p.includes("@") ? c === p : d === p || d.endsWith(`.${p}`)) return p;
  }
  return null;
}

export type PdfsFaltantes = { motivo: string; reintentar: boolean };

/**
 * Gmail tenía PDF que no llegaron a la plataforma: el correo no se descarta, queda en error para
 * reintentarse. Si solo faltan los omitidos por tamaño, reintentar no ayuda (queda en el Panel).
 */
export function pdfsFaltantes(c: { pdfsEnGmail: number | null; pdfsRecibidos: number; omitidos: { nombre?: string | null; motivo?: string | null; buzon?: boolean }[] }): PdfsFaltantes | null {
  const omitidos = c.omitidos.filter((o) => esPdfAdjunto({ nombre: o.nombre }));
  const enGmail = c.pdfsEnGmail ?? 0;
  if (enGmail <= c.pdfsRecibidos && !omitidos.length) return null;
  const total = Math.max(enGmail, c.pdfsRecibidos + omitidos.length);
  const nombres = omitidos.map((o) => `${o.nombre} (${o.motivo || "omitido por el buzón"})`).join(", ");
  // Lo que el script omitió a propósito (tamaño, límite) volverá a omitirse: reintentar no ayuda.
  const explicados = omitidos.filter((o) => o.buzon !== false).length;
  const definitivo = explicados > 0 && explicados >= total - c.pdfsRecibidos;
  return {
    motivo: `Gmail tenía ${total} PDF y a la plataforma llegaron ${c.pdfsRecibidos}${nombres ? `: falta ${nombres}` : ""}. ${definitivo ? "Descarga los PDF del correo original y usa «Crear solicitud» o súbelos al Expediente." : "Se reintentará el envío."}`,
    reintentar: !definitivo,
  };
}

export type DecisionCorreo =
  | { accion: "leer" }
  | { accion: "descartar"; motivo: string; categoria: CategoriaDescarte }
  | { accion: "error"; motivo: string; reintentar: boolean }
  | { accion: "adjuntar" }
  | { accion: "crear"; avisos: string[] };

/**
 * Por qué se descartó: ordena la pestaña Descartadas (con PDF primero) y decide qué se guarda.
 * «ignorado» y «sin_pdf» quedan como una línea breve: sin texto, sin adjuntos y sin IA.
 */
export type CategoriaDescarte = "ignorado" | "sin_pdf" | "sin_documentos" | "ambiguo" | "manual";
export const DESCARTE_BREVE: readonly CategoriaDescarte[] = ["ignorado", "sin_pdf"];

export const AVISO_CREADA_MANUAL = "Creada manualmente desde el registro de correos";

/**
 * Regla única: solo crea solicitud un correo con al menos un documento de importación en PDF que no
 * corresponde a un Expediente existente. Un Expediente existente recibe solo sus documentos de
 * importación. Todo lo demás se descarta con su motivo (recuperable con «Crear solicitud»). La IA no
 * decide; solo extrae datos. `documentos` = null antes de leer los PDF (primera pasada).
 */
export function decidirCorreo(c: {
  forzado?: boolean; ignorado?: string | null; faltantes?: PdfsFaltantes | null; pdfs: number;
  documentos: number | null; ilegibles?: string[]; otros?: string[]; expediente?: string | null; ambiguos?: string | null;
  /** PDF reconocidos como pago de impuestos (Recibo/PIN): solo se adjuntan a un Expediente existente. */
  pagos?: number;
}): DecisionCorreo {
  const pagos = c.pagos ?? 0;
  const exp = c.expediente ?? null;
  if (c.forzado) {
    if (c.documentos == null && c.pdfs > 0) return { accion: "leer" };
    if (exp && (c.documentos ?? 0) + pagos > 0) return { accion: "adjuntar" };
    return { accion: "crear", avisos: [AVISO_CREADA_MANUAL] };
  }
  if (c.ignorado) return { accion: "descartar", categoria: "ignorado", motivo: `Remitente ignorado (${c.ignorado}): sus correos nunca crean solicitud.` };
  if (c.faltantes) return { accion: "error", motivo: c.faltantes.motivo, reintentar: c.faltantes.reintentar };
  if (c.pdfs === 0) {
    return { accion: "descartar", categoria: "sin_pdf", motivo: exp ? `Corresponde al Expediente ${exp}, pero no trae documentos PDF; no se agregó nada.` : "Sin documentos PDF: no es una solicitud nueva de embarque." };
  }
  if (c.documentos == null) return { accion: "leer" };
  if (exp && c.documentos + pagos > 0) return { accion: "adjuntar" };
  if (c.documentos === 0 && pagos > 0) {
    if (c.ambiguos) return { accion: "descartar", categoria: "ambiguo", motivo: `Pago de impuestos de varios Expedientes posibles (${c.ambiguos}); revisar y adjuntarlo a mano.` };
    return { accion: "descartar", categoria: "sin_documentos", motivo: `Solo trae ${pagos === 1 ? "un pago" : `${pagos} pagos`} de impuestos y no corresponde a ningún Expediente registrado; un pago no crea solicitud.` };
  }
  if (c.documentos === 0) {
    const ilegibles = c.ilegibles ?? [];
    if (ilegibles.length) return { accion: "error", motivo: `No se pudo leer ${ilegibles.join(", ")}; se reintentará antes de decidir.`, reintentar: true };
    const otros = c.otros?.length ? ` (${c.otros.slice(0, 5).join(", ")})` : "";
    return { accion: "descartar", categoria: "sin_documentos", motivo: exp
      ? `Corresponde al Expediente ${exp}, pero sus PDF no son documentos de importación${otros}; no se agregó nada.`
      : `Sin documentos de importación: sus PDF son «Otros documentos»${otros}.` };
  }
  if (exp) return { accion: "adjuntar" };
  if (c.ambiguos) return { accion: "descartar", categoria: "ambiguo", motivo: `Corresponde a varios Expedientes (${c.ambiguos}); revisar y adjuntar o crear la solicitud a mano.` };
  return { accion: "crear", avisos: [] };
}

export type DocumentoExistente = { id: string; tipo: string | null; storage_path: string | null; file_hash: string | null };
export type UbicacionDocumento =
  | { accion: "insertar" }
  | { accion: "duplicado"; documento_id: string | null }
  | { accion: "conflicto"; documento_id: string | null };

/**
 * Casilla de cada documento recibido para un Expediente existente: va a la casilla de su tipo;
 * el mismo archivo ya guardado se omite; una casilla ya ocupada (antes o por otro PDF del mismo
 * correo) nunca se reemplaza: queda como conflicto para que una persona decida.
 */
export function ubicarDocumentosExpediente(
  documentos: { tipo: string; hash: string | null }[],
  existentes: DocumentoExistente[],
): UbicacionDocumento[] {
  const conArchivo = existentes.filter((d) => d.storage_path);
  const ocupadas = new Map<string, string | null>();
  for (const d of conArchivo) if (d.tipo && !ocupadas.has(d.tipo)) ocupadas.set(d.tipo, d.id);
  const hashes = new Map<string, string | null>(conArchivo.filter((d) => d.file_hash).map((d) => [d.file_hash!, d.id]));
  return documentos.map((d) => {
    if (d.hash && hashes.has(d.hash)) return { accion: "duplicado", documento_id: hashes.get(d.hash) ?? null };
    if (d.hash) hashes.set(d.hash, null);
    if (ocupadas.has(d.tipo)) return { accion: "conflicto", documento_id: ocupadas.get(d.tipo) ?? null };
    ocupadas.set(d.tipo, null);
    return { accion: "insertar" };
  });
}

/** PDF recibido cuya casilla ya estaba ocupada: espera la decisión de una persona en el Registro. */
export type ConflictoDocumento = {
  nombre: string; tipo: string; storage_path: string; bytes: number; file_hash: string | null;
  estado: "pendiente" | "reemplazado" | "descartado"; resuelto_por?: string; resuelto_en?: string;
};

export async function sha256Bytes(bytes: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
