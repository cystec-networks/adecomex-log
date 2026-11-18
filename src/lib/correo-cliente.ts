import { clienteDocumentoUnico, coincidenciasClienteDocumento, nombreBaseCliente } from "./cliente-documento";

/**
 * Cliente de una solicitud por correo: explica qué nombre se leyó en cada fuente (documento, remitente,
 * asunto/cuerpo), con qué clientes registrados se comparó y qué opciones hay para elegir. Solo sugiere:
 * nunca asigna un cliente sin la elección de la persona.
 */

export type ClienteCatalogo = { id: string; nombre: string; email?: string | null; rnc?: string | null; activo?: boolean | null };
export type Parecido<T extends ClienteCatalogo = ClienteCatalogo> = { cliente: T; similitud: number; exacta: boolean };
/** Decisión recordada: este remitente eligió (o creó) ese cliente para documentos de esa empresa. */
export type RemitenteRecordado = { correo: string; cliente_id: string; empresa_documento: string };

/** Nombre comparable: sin mayúsculas, acentos, puntos, comas ni forma societaria (S.R.L., SRL, S R L, SAS, S.A.). */
export const nombreComparable = (s: string | null | undefined) => nombreBaseCliente(s ?? "");

const bigramas = (s: string) => {
  const t = s.replace(/\s+/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) ?? 0) + 1); }
  return m;
};

const GENERICAS = new Set([
  "DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "THE", "AND", "INTERNACIONAL", "COMPANIA", "GRUPO", "COMERCIAL", "COMERCIALIZADORA",
  "IMPORTADORA", "IMPORTACIONES", "DISTRIBUIDORA", "INDUSTRIAL", "INDUSTRIAS", "PROCESADORA", "GRANOS", "TRADING", "DOMINICANA",
  "ALMACENES", "SERVICIOS", "INVERSIONES", "PRODUCTOS", "CORPORACION",
]);
const distintivas = (base: string) => base.split(" ").filter((t) => t.length >= 3 && !GENERICAS.has(t));

/** Similitud 0–1 entre dos nombres de empresa ya normalizados (bigramas + palabras distintivas compartidas). */
export function similitudNombres(a: string, b: string): number {
  const x = nombreComparable(a), y = nombreComparable(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigramas(x), by = bigramas(y);
  let comunes = 0, total = 0;
  for (const [k, v] of bx) { comunes += Math.min(v, by.get(k) ?? 0); total += v; }
  for (const v of by.values()) total += v;
  const dice = total ? (2 * comunes) / total : 0;
  const dx = distintivas(x), dy = distintivas(y);
  const corto = dx.length <= dy.length ? dx : dy, largo = dx.length <= dy.length ? dy : dx;
  const contiene = corto.length > 0 && corto.every((t) => largo.includes(t));
  return Math.round(Math.max(dice, contiene ? 0.9 : 0) * 100) / 100;
}

/**
 * Clientes registrados más parecidos al nombre leído (de mayor a menor). «Exacta» usa la misma comparación
 * flexible del Expediente (`cliente-documento`); las mismas palabras en otro orden cuentan como muy parecidas.
 */
export function clientesParecidos<T extends ClienteCatalogo>(nombre: string | null | undefined, clientes: readonly T[], max = 5, umbral = 0.45): Parecido<T>[] {
  const base = nombreComparable(nombre);
  if (!base) return [];
  const activos = clientes.filter((c) => c.activo !== false);
  const flexibles = new Map(coincidenciasClienteDocumento(nombre ?? "", activos).map((m) => [m.cliente.id, m]));
  return activos
    .map((cliente) => {
      const f = flexibles.get(cliente.id);
      const exacta = !!f && (f.exacta || nombreComparable(cliente.nombre) === base);
      const similitud = Math.max(similitudNombres(nombre ?? "", cliente.nombre), exacta ? 1 : f ? 0.95 : 0);
      return { cliente, similitud, exacta };
    })
    .filter((p) => p.exacta || p.similitud >= umbral)
    .sort((a, b) => Number(b.exacta) - Number(a.exacta) || b.similitud - a.similitud || a.cliente.nombre.localeCompare(b.cliente.nombre))
    .slice(0, max);
}

const DOMINIOS_PUBLICOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.es", "icloud.com", "live.com", "msn.com", "aol.com", "protonmail.com"]);
export const dominioCorreo = (correo: string | null | undefined) => {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})\s*>?\s*$/i.exec((correo ?? "").trim());
  return m ? m[1].toLowerCase() : null;
};
const correosDe = (s: string | null | undefined) => (s ?? "").split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"));
/** Nombre de empresa a partir del dominio (lasanjuanera.com.do → LASANJUANERA). */
export const empresaDeDominio = (dominio: string | null) => (dominio ? dominio.split(".")[0].toUpperCase() : null);

/** Correo limpio del remitente («Nombre <a@b.com>» → a@b.com). */
export const correoRemitente = (s: string | null | undefined) => {
  const m = /[^<>\s]+@[^<>\s]+/.exec(s ?? "");
  return m ? m[0].trim().toLowerCase() : null;
};

/**
 * Clientes asociados al remitente: su correo está en la ficha del cliente o quedó asociado al elegir el cliente
 * en una conversión anterior (un mismo correo puede estar asociado a varias empresas relacionadas). Si no hay
 * ninguno y el dominio no es público, los del mismo dominio. Es solo una sugerencia, nunca identifica.
 */
export function clientesDelRemitente<T extends ClienteCatalogo>(correo: string | null | undefined, clientes: readonly T[], recordados: readonly RemitenteRecordado[] = []): { cliente: T; por: "correo" | "asociado" | "dominio" }[] {
  const c = correoRemitente(correo);
  const dominio = dominioCorreo(c);
  if (!c || !dominio) return [];
  const activos = clientes.filter((x) => x.activo !== false);
  const res: { cliente: T; por: "correo" | "asociado" | "dominio" }[] = activos.filter((x) => correosDe(x.email).includes(c)).map((cliente) => ({ cliente, por: "correo" as const }));
  for (const r of recordados) {
    if (r.correo.toLowerCase() !== c || res.some((x) => x.cliente.id === r.cliente_id)) continue;
    const cliente = activos.find((x) => x.id === r.cliente_id);
    if (cliente) res.push({ cliente, por: "asociado" });
  }
  if (res.length) return res;
  if (DOMINIOS_PUBLICOS.has(dominio) || dominio.endsWith(".local")) return [];
  return activos.filter((x) => correosDe(x.email).some((e) => dominioCorreo(e) === dominio)).map((cliente) => ({ cliente, por: "dominio" as const }));
}

/** Cliente elegido antes para este remitente con documentos de la misma empresa (único; si hubo varios, no decide). */
export function clienteRecordado<T extends ClienteCatalogo>(correo: string | null | undefined, nombreDocumento: string | null | undefined, recordados: readonly RemitenteRecordado[], clientes: readonly T[]): T | null {
  const c = correoRemitente(correo), empresa = nombreComparable(nombreDocumento);
  if (!c || !empresa) return null;
  const ids = [...new Set(recordados.filter((r) => r.correo.toLowerCase() === c && r.empresa_documento === empresa).map((r) => r.cliente_id))];
  if (ids.length !== 1) return null;
  return clientes.find((x) => x.id === ids[0] && x.activo !== false) ?? null;
}

/**
 * Cliente con el que se guarda un correo nuevo: el del documento (comparación flexible del Expediente) o, si el
 * documento no coincide con ningún cliente, el elegido antes para ese remitente con documentos de la misma
 * empresa. El remitente por sí solo nunca identifica al cliente.
 */
export function clienteAlRecibirCorreo<T extends ClienteCatalogo>(nombreDocumento: string | null | undefined, correo: string | null | undefined, clientes: readonly T[], recordados: readonly RemitenteRecordado[]): { cliente: T; por: "documento" | "recordado" } | null {
  const activos = clientes.filter((x) => x.activo !== false);
  const doc = clienteDocumentoUnico(nombreDocumento, activos);
  if (doc) return { cliente: doc, por: "documento" };
  const rec = clienteRecordado(correo, nombreDocumento, recordados, activos);
  return rec ? { cliente: rec, por: "recordado" } : null;
}

/** Aviso guardado cuando el cliente se tomó de una decisión recordada. */
export const avisoClienteRecordado = (cliente: string, empresa: string) => `Cliente recordado: «${cliente}», elegido antes para este remitente con documentos de «${empresa}».`;

const AVISO_EXPEDIENTE_INEXISTENTE = /^El (asunto|cuerpo|correo)[^.]*? menciona el Expediente (.+?), que no existe en la plataforma\.?$/;
/** Avisos informativos (no son alertas): Expediente mencionado que no existe, cliente recordado. */
export const avisoInformativoCorreo = (a: string) => AVISO_EXPEDIENTE_INEXISTENTE.test(a.trim()) || a.startsWith("Cliente recordado:");
/** Números de Expediente mencionados en el asunto/cuerpo que no existen en la plataforma. */
export function expedientesInexistentes(advertencias: readonly string[] | null | undefined): { origen: string; numeros: string } | null {
  for (const a of advertencias ?? []) {
    const m = AVISO_EXPEDIENTE_INEXISTENTE.exec(a.trim());
    if (m) return { origen: m[1], numeros: m[2] };
  }
  return null;
}
/** Motivo del Registro sin el aviso informativo pegado (registros antiguos lo concatenaban al «creada»). */
export const motivoSinAvisoInformativo = (motivo: string | null | undefined) =>
  (motivo ?? "").replace(/\.\s*El (asunto|cuerpo|correo)[^.]*? menciona el Expediente .+?, que no existe en la plataforma\.?$/, "");

/** Nombre que el asunto o el cuerpo sugerían para el cliente (aviso guardado al recibir el correo). */
export function nombreAsuntoCuerpo(advertencias: readonly string[] | null | undefined): string | null {
  for (const a of advertencias ?? []) {
    const m = /^Cliente: verificar: el asunto\/cuerpo sugiere un valor distinto \((.+?)\); se usó/.exec(a);
    if (m) return m[1].trim();
  }
  return null;
}

/** Clientes registrados mencionados en el asunto por una palabra distintiva de su nombre (p. ej. «MAGUANA»). */
export function clientesEnAsunto<T extends ClienteCatalogo>(asunto: string | null | undefined, clientes: readonly T[]): T[] {
  const palabras = new Set(nombreComparable(asunto).split(" "));
  return clientes.filter((c) => c.activo !== false && distintivas(nombreComparable(c.nombre)).some((t) => t.length >= 4 && palabras.has(t)));
}

/** El asunto nombra a la empresa del documento (todas sus palabras distintivas aparecen). */
export function asuntoMenciona(asunto: string | null | undefined, nombre: string | null | undefined): boolean {
  const palabras = new Set(nombreComparable(asunto).split(" "));
  const d = distintivas(nombreComparable(nombre));
  return d.length > 0 && d.every((t) => palabras.has(t));
}

export type OpcionCliente<T extends ClienteCatalogo = ClienteCatalogo> = {
  /** Cliente registrado; null = nombre del documento sin registrar (se ofrece crearlo). */
  cliente: T | null;
  nombre: string;
  fuente: "documento" | "recordado" | "remitente" | "asunto";
  motivo: string;
};

export type AnalisisClienteCorreo<T extends ClienteCatalogo = ClienteCatalogo> = {
  documento: { nombre: string | null; coincidencia: T | null; parecidos: Parecido<T>[] };
  /** Cliente elegido antes para este remitente con documentos de la misma empresa. */
  recordado: T | null;
  remitente: { correo: string | null; dominio: string | null; empresa: string | null; clientes: { cliente: T; por: "correo" | "asociado" | "dominio" }[] };
  asunto: { nombre: string | null; parecidos: Parecido<T>[]; mencionados: T[]; mencionaDocumento: boolean };
  /** El remitente pertenece a otra empresa distinta a la del documento: elegir cuál es el cliente. */
  empresasDistintas: boolean;
  opciones: OpcionCliente<T>[];
};

export function analizarClienteCorreo<T extends ClienteCatalogo>(
  s: { cliente_id?: string | null; cliente_nombre?: string | null; remitente_correo?: string | null; remitente?: string | null; asunto?: string | null; advertencias?: readonly string[] | null },
  clientes: readonly T[],
  recordados: readonly RemitenteRecordado[] = [],
): AnalisisClienteCorreo<T> {
  const nombreDoc = s.cliente_nombre?.trim() || null;
  const asignado = s.cliente_id ? clientes.find((c) => c.id === s.cliente_id) ?? null : null;
  const parecidosDoc = clientesParecidos(nombreDoc, clientes);
  const exactasDoc = parecidosDoc.filter((p) => p.exacta);
  const correo = correoRemitente(s.remitente_correo ?? s.remitente) ?? s.remitente_correo ?? null;
  const dominio = dominioCorreo(correo);
  const delRemitente = clientesDelRemitente(correo, clientes, recordados);
  const recordado = clienteRecordado(correo, nombreDoc, recordados, clientes);
  const docUnico = exactasDoc.length === 1 ? exactasDoc[0].cliente : null;
  // Asignado al recibir: si vino de una decisión recordada (y no del documento), se muestra como recordado.
  const coincidencia = docUnico ?? (asignado && asignado.id !== recordado?.id ? asignado : null);
  const elegidoDoc = coincidencia ?? recordado;
  const nombreAsunto = nombreAsuntoCuerpo(s.advertencias);
  const mencionados = clientesEnAsunto(s.asunto, clientes);

  // Empresas distintas: el remitente es de un cliente registrado y el documento habla de otra empresa. Si el
  // remitente ya está asociado también al cliente del documento (empresas relacionadas), no hay conflicto.
  const empresaRemitente = delRemitente.map((r) => r.cliente);
  const empresasDistintas = !!nombreDoc && empresaRemitente.length > 0
    && empresaRemitente.every((c) => (elegidoDoc ? c.id !== elegidoDoc.id : similitudNombres(nombreDoc, c.nombre) < 0.9));

  const opciones: OpcionCliente<T>[] = [];
  const agregar = (o: OpcionCliente<T>) => {
    if (o.cliente ? opciones.some((x) => x.cliente?.id === o.cliente!.id) : opciones.some((x) => !x.cliente)) return;
    opciones.push(o);
  };
  if (nombreDoc) {
    if (coincidencia) agregar({ cliente: coincidencia, nombre: coincidencia.nombre, fuente: "documento", motivo: `Cliente del documento: «${nombreDoc}»` });
    else if (recordado) agregar({ cliente: recordado, nombre: recordado.nombre, fuente: "recordado", motivo: `Elegido antes para este remitente con documentos de «${nombreDoc}»` });
    else agregar({ cliente: null, nombre: nombreDoc, fuente: "documento", motivo: `Cliente del documento: «${nombreDoc}» (sin registrar)` });
  }
  const sugerencia = (por: "correo" | "asociado" | "dominio") => por === "correo" ? `Sugerencia por remitente: ${correo} está registrado en su ficha` : por === "asociado" ? `Sugerencia por remitente: ${correo} quedó asociado a este cliente` : `Sugerencia por remitente: mismo dominio @${dominio}`;
  for (const r of delRemitente) agregar({ cliente: r.cliente, nombre: r.cliente.nombre, fuente: "remitente", motivo: sugerencia(r.por) });
  for (const p of parecidosDoc) agregar({ cliente: p.cliente, nombre: p.cliente.nombre, fuente: "documento", motivo: `Parecido al documento (${Math.round(p.similitud * 100)} %)` });
  for (const c of mencionados) agregar({ cliente: c, nombre: c.nombre, fuente: "asunto", motivo: "Mencionado en el asunto" });

  return {
    documento: { nombre: nombreDoc, coincidencia, parecidos: parecidosDoc },
    recordado,
    remitente: { correo, dominio, empresa: empresaDeDominio(dominio), clientes: delRemitente },
    asunto: { nombre: nombreAsunto, parecidos: clientesParecidos(nombreAsunto, clientes, 3), mencionados, mencionaDocumento: asuntoMenciona(s.asunto, nombreDoc) },
    empresasDistintas,
    opciones,
  };
}

/** Nombre propuesto para crear el cliente: mayúsculas, sin comas ni puntos en la forma societaria (IFZ COMERCIAL, S.R.L. → IFZ COMERCIAL SRL). */
export function nombreParaCatalogo(nombre: string | null | undefined): string {
  return (nombre ?? "").toUpperCase()
    .replace(/\bS\.?\s?R\.?\s?L\.?(?=\s|$)/g, "SRL").replace(/\bS\.?\s?A\.?\s?S\.?(?=\s|$)/g, "SAS").replace(/\bS\.?\s?A\.?(?=\s|$)/g, "SA")
    .replace(/,/g, " ").replace(/\s+/g, " ").trim();
}
