// Número de Declaración (DUA) desde la Liquidación de Impuestos o el DUA, con reglas fijas y sin IA.
// La Liquidación trae tres números parecidos (Declaración IC01, Liquidación CL11, ResuInsp IC10):
// solo vale el que está junto a «Declaración». Si el texto no lo trae, se usa el nombre del archivo
// (DOC-<número>_...). El emparejamiento usa «EXP.: <número>» y el BL hijo; cliente, agencia y
// resolución nunca bloquean.

export const TIPO_DUA = "Declaración Única Aduanera (DUA)";
export const TIPO_LIQUIDACION = "Reporte de Liquidación de Impuestos";
export const TIPOS_LECTURA_DUA = [TIPO_LIQUIDACION, TIPO_DUA] as const;
export const esTipoLecturaDua = (tipo: string | null | undefined) => tipo === TIPO_LIQUIDACION || tipo === TIPO_DUA;
export const ETIQUETA_AUTO_DUA = "Automático";

/** 5 dígitos - 2 letras + 2 dígitos - 4 dígitos - 6 hexadecimales (puede terminar en letra). */
export const PATRON_NUMERO_DUA = /^\d{5}-[A-Z]{2}\d{2}-\d{4}-[0-9A-F]{6}$/;
const NUMERO_GLOBAL = /(?<![0-9A-Za-z])(\d{5}-[A-Z]{2}\d{2}-\d{4}-[0-9A-F]{6})(?![0-9A-Za-z])/g;
export const esNumeroDua = (v: unknown): v is string => typeof v === "string" && PATRON_NUMERO_DUA.test(v.trim());

export type LecturaNumero = { numero: string | null; motivo: string | null };

/**
 * Solo el número precedido por «Declaración» (con «:» o saltos de línea en medio, como en LCL, o
 * «NO. DE DECLARACIÓN» del DUA). Si no hay ninguno antes, acepta el formato con la etiqueta justo
 * después del número («número / Declaración :»). Varios números distintos junto a Declaración: no decide.
 */
export function leerNumeroDeclaracion(texto: string | null | undefined): LecturaNumero {
  const t = String(texto ?? "");
  if (!t.trim()) return { numero: null, motivo: "El PDF no tiene texto legible (parece escaneado)." };
  const candidatos = [...t.matchAll(NUMERO_GLOBAL)].map((m) => ({ numero: m[1], inicio: m.index ?? 0, fin: (m.index ?? 0) + m[1].length }));
  if (!candidatos.length) return { numero: null, motivo: "El texto no contiene ningún número con formato de Declaración (ej. 10030-IC01-2611-002613)." };
  const antes = new Set<string>(), despues = new Set<string>();
  candidatos.forEach((c, i) => {
    const desde = Math.max(i > 0 ? candidatos[i - 1].fin : 0, c.inicio - 60);
    if (/DECLARACI[OÓ]N[\s:.]*$/i.test(t.slice(desde, c.inicio))) antes.add(c.numero);
    const hasta = Math.min(i + 1 < candidatos.length ? candidatos[i + 1].inicio : t.length, c.fin + 40);
    if (/^\s*(?:\(\s*\d+(?:\.\d+)?\s*\))?\s*DECLARACI[OÓ]N\s*:/i.test(t.slice(c.fin, hasta))) despues.add(c.numero);
  });
  const elegidos = antes.size ? antes : despues;
  if (elegidos.size === 1) return { numero: [...elegidos][0], motivo: null };
  if (elegidos.size > 1) return { numero: null, motivo: `Hay ${elegidos.size} números distintos junto a «Declaración» (${[...elegidos].join(", ")}); no se eligió ninguno.` };
  return { numero: null, motivo: "Ningún número está junto a «Declaración» (solo se encontraron los de Liquidación o ResuInsp)." };
}

/** «DOC-<número>_...» o «DOC -<número> ...», aunque lleve el prefijo de fecha del almacenamiento. */
export function numeroDuaDesdeArchivo(nombre: string | null | undefined): string | null {
  const base = String(nombre ?? "").split("/").pop() ?? "";
  const m = base.match(/(?:^|[^A-Za-z0-9])DOC\s*-\s*(\d{5}-[A-Za-z]{2}\d{2}-\d{4}-[0-9A-Fa-f]{6})(?![0-9A-Za-z])/i);
  const n = m?.[1]?.toUpperCase() ?? null;
  return n && PATRON_NUMERO_DUA.test(n) ? n : null;
}

export type NumeroResuelto = { numero: string | null; fuente: "texto" | "archivo" | null; alerta: string | null; motivo: string | null };

/** Texto primero; si no, nombre del archivo. Si ambos existen y difieren gana el texto, con alerta. */
export function resolverNumeroDua(texto: LecturaNumero, nombreArchivo: string | null | undefined): NumeroResuelto {
  const archivo = numeroDuaDesdeArchivo(nombreArchivo);
  if (texto.numero) {
    const alerta = archivo && archivo !== texto.numero ? `El nombre del archivo dice ${archivo}, pero el documento dice ${texto.numero}; se usa el del documento.` : null;
    return { numero: texto.numero, fuente: "texto", alerta, motivo: null };
  }
  if (archivo) return { numero: archivo, fuente: "archivo", alerta: null, motivo: null };
  return { numero: null, fuente: null, alerta: null, motivo: `${texto.motivo ?? "No se encontró el número junto a «Declaración»."} El nombre del archivo tampoco trae DOC-<número>.` };
}

/** «EXP.: 202611I413» de las Observaciones. */
export function expDesdeTexto(texto: string | null | undefined): string | null {
  const m = String(texto ?? "").match(/\bEXP\.?\s*:\s*([A-Z0-9][A-Z0-9-]{3,}[A-Z0-9])/i);
  return m ? m[1].toUpperCase() : null;
}

export type DuaDocumento = { declaracion: string | null; motivo: string | null; fecha_declaracion: string | null; bl: string | null; exp: string | null; importador: string | null };

const fechaIso = (v: string | null | undefined) => {
  const m = String(v ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};

/** Formulario DUA (incluido el DUA TEMP): número, fecha, Doc. de Embarque, EXP e importador. */
export function leerDuaDocumento(texto: string | null | undefined): DuaDocumento {
  const t = String(texto ?? "");
  const num = leerNumeroDeclaracion(t);
  const bl = t.match(/Doc\.?\s*de\s*Embarque[ \t:]*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ?? null;
  const fecha = t.match(/NO\.?\s*DE\s*DECLARACI[OÓ]N[\s\S]{0,80}?\bFECHA[ \t:]*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;
  const importador = t.match(/NOMBRE\s+O\s+RAZ[OÓ]N\s+SOCIAL\s*\n\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  return { declaracion: num.numero, motivo: num.motivo, fecha_declaracion: fechaIso(fecha), bl: bl?.toUpperCase() ?? null, exp: expDesdeTexto(t), importador: importador && importador !== "_" ? importador : null };
}

const normal = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const baseCliente = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ")
  .replace(/\b(?:S A S|S A|S R L|SAS|SA|SRL|LLC|INC|LTD|CORP)\b/g, " ").replace(/\s+/g, "");
export type Comparacion = "coincide" | "no_coincide" | "sin_dato";

export type EmparejamientoDua = { aplicar: boolean; exp: Comparacion; bl: Comparacion; cliente: Comparacion; errores: string[]; alertas: string[] };

/**
 * EXP y BL hijo emparejan. Solo se bloquea cuando el documento es claramente de otro Expediente
 * (un dato no coincide y el otro tampoco confirma). Cliente, agencia y resolución solo avisan.
 */
export function emparejarDua(exp: { numero?: unknown; bl_awb?: unknown; clientes_nombres?: (string | null | undefined)[] }, doc: { exp?: string | null; bl?: string | null; importador?: string | null }): EmparejamientoDua {
  const cmpExp: Comparacion = !doc.exp || !normal(exp.numero) ? "sin_dato" : normal(doc.exp) === normal(exp.numero) ? "coincide" : "no_coincide";
  const blsExp = String(exp.bl_awb ?? "").split(/[\s,;/|]+/).map(normal).filter(Boolean);
  const cmpBl: Comparacion = !doc.bl || !blsExp.length ? "sin_dato" : blsExp.includes(normal(doc.bl)) ? "coincide" : "no_coincide";
  const nombres = (exp.clientes_nombres ?? []).map(baseCliente).filter(Boolean);
  const cmpCliente: Comparacion = !doc.importador || !nombres.length ? "sin_dato" : nombres.includes(baseCliente(doc.importador)) ? "coincide" : "no_coincide";
  const errores: string[] = [], alertas: string[] = [];
  const bloquea = (cmpExp === "no_coincide" && cmpBl !== "coincide") || (cmpBl === "no_coincide" && cmpExp !== "coincide");
  if (bloquea) errores.push(`El documento parece de otro Expediente${doc.exp ? ` (EXP.: ${doc.exp})` : ""}${doc.bl ? ` (BL ${doc.bl})` : ""}; no se llenó nada.`);
  else {
    if (cmpExp === "no_coincide") alertas.push(`EXP del documento (${doc.exp}) distinto al Expediente; el BL sí coincide.`);
    if (cmpBl === "no_coincide") alertas.push(`BL del documento (${doc.bl}) distinto al del Expediente; el EXP sí coincide.`);
    if (cmpExp === "sin_dato" && cmpBl === "sin_dato") alertas.push("No se pudo comprobar EXP ni BL hijo con el Expediente.");
  }
  if (cmpCliente === "no_coincide") alertas.push(`Importador del documento (${doc.importador}) distinto al cliente del Expediente.`);
  return { aplicar: !bloquea, exp: cmpExp, bl: cmpBl, cliente: cmpCliente, errores, alertas };
}

export type EstadoLecturaDua = "aplicado" | "coincide" | "conservado" | "sin_numero" | "rechazado";
export type LecturaDuaGuardada = {
  archivo: string | null; tipo: string; estado: EstadoLecturaDua; numero: string | null; fuente: "texto" | "archivo" | null;
  motivo: string | null; alertas: string[]; procesado_en?: string; origen?: "manual" | "leer_ahora" | "retroactivo";
};

/** Llena «Declaración DUA» solo si está vacía; si ya tiene otro número, lo conserva y avisa. */
export function decidirNumeroDua(actual: unknown, resuelto: NumeroResuelto, emparejamiento: EmparejamientoDua): { numero_dua?: string; estado: EstadoLecturaDua; motivo: string | null; alertas: string[] } {
  const alertas = [...(resuelto.alerta ? [resuelto.alerta] : []), ...emparejamiento.alertas];
  if (!emparejamiento.aplicar) return { estado: "rechazado", motivo: emparejamiento.errores.join(" "), alertas };
  if (!resuelto.numero) return { estado: "sin_numero", motivo: resuelto.motivo, alertas };
  const previo = String(actual ?? "").trim();
  if (!previo) return { numero_dua: resuelto.numero, estado: "aplicado", motivo: null, alertas };
  if (previo.toUpperCase() === resuelto.numero) return { estado: "coincide", motivo: null, alertas };
  return { estado: "conservado", motivo: null, alertas: [...alertas, `Declaración DUA: documento ${resuelto.numero}; Expediente ${previo}. Se conserva el dato del Expediente.`] };
}

/** La etiqueta «Automático» solo se muestra mientras el valor actual es el que llenó el documento. */
export function esAutomaticoDua(exp: Record<string, unknown> | null | undefined, valor?: unknown): boolean {
  const reg = ((exp?.dga_auto ?? {}) as Record<string, { valor?: unknown }>).numero_dua;
  const actual = String(valor ?? exp?.numero_dua ?? "").trim();
  return !!reg && !!actual && String(reg.valor ?? "").trim() === actual;
}
