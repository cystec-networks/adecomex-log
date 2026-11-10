/**
 * Proceso compartido de un correo entrante (webhook de Gmail y «Crear solicitud» desde el registro).
 * Solo servidor: usa el cliente de servicio que recibe como parámetro.
 */
import { z } from "zod";
import { aislarMensajeReciente, avisoFechaLlegada, combinarDatos, extraerPorEtiquetas, fusionarAsunto, fusionarAdjuntos } from "@/lib/correo-solicitud";
import { adjuntoCorreoSchema, normalizarAdjuntosCorreo, mimeAdjuntoCorreo, deduplicarAdjuntosCorreo } from "@/lib/correo-adjuntos";
import { decidirCorreoSinExpediente, esDocumentoAdjunto, extraerNumeroVuce, normalizarBl, numerosExpedienteCorreo, propuestasParaExpediente } from "@/lib/correo-expediente";
import { contextoExpediente, expedientesPorBl, expedientesPorNumero, expedientesPorVuce, verificarRemitente, type ExpedienteCorreo } from "@/lib/correo-recepcion.server";
import { leerArchivoCorreo, MIME_OK, type AdjuntoProcesado } from "@/lib/correo-adjunto-lectura.server";
import { contarPaginasPdf } from "@/lib/correo-documento-combinado.server";
import { optimizarDocumento } from "@/lib/documento-optimizacion";
import { bytesABase64 } from "@/lib/correo-adjunto-lectura.server";
import { esTimeoutGateway, UMBRAL_PAGINAS_COMBINADO, AVISO_PROCESANDO_COMBINADO } from "@/lib/correo-documento-combinado";

const adjuntoSchema = adjuntoCorreoSchema;

/** PDFs largos o que agotan el tiempo del gateway se aceptan y se separan en segundo plano. */
async function leerAdjunto(a: z.infer<typeof adjuntoSchema>): Promise<AdjuntoProcesado> {
  const base64 = a.contenido.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  const mime = mimeAdjuntoCorreo(a.nombre, a.tipo, a.contenido);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); }
  catch { return { tipo: "Otro", nombre: a.nombre, mime, bytes: new Uint8Array(), error: "Contenido base64 inválido" }; }
  const original = bytes;
  const optimizado = await optimizarDocumento(bytes, mime);
  bytes = optimizado.bytes;
  const base: AdjuntoProcesado = { tipo: "Otro", nombre: a.nombre, mime, bytes, firmado: optimizado.motivo === "firmado" };
  if (!MIME_OK.test(mime)) return base;
  const esPdf = mime === "application/pdf";
  const paginas = esPdf ? await contarPaginasPdf(bytes) : null;
  if (paginas != null && paginas > UMBRAL_PAGINAS_COMBINADO && optimizado.motivo !== "firmado") return { ...base, combinado: { motivo: "paginas", paginas } };
  try {
    const leido = await leerArchivoCorreo(a.nombre, mime, bytesABase64(bytes), bytes);
    if (optimizado.ahorro && (leido.tipo === "Otro" || leido.error)) {
      return await leerArchivoCorreo(a.nombre, mime, base64, original);
    }
    return { ...leido, firmado: base.firmado };
  } catch (e: any) {
    if (optimizado.ahorro) {
      try { return await leerArchivoCorreo(a.nombre, mime, base64, original); }
      catch { bytes = original; base.bytes = original; }
    }
    if (esPdf && esTimeoutGateway(e) && optimizado.motivo !== "firmado") return { ...base, combinado: { motivo: "timeout", paginas } };
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

async function encolarCombinados(db: any, adjuntos: AdjuntoProcesado[], destino: { solicitud_id?: string; expediente_id?: string; documentos?: Map<string, string> }) {
  const filas = adjuntos.filter((a) => a.combinado && a.storage_path).map((a) => ({
    solicitud_id: destino.solicitud_id ?? null, expediente_id: destino.expediente_id ?? null,
    documento_id: destino.documentos?.get(a.storage_path!) ?? null,
    nombre: a.nombre, storage_path: a.storage_path, paginas: a.combinado!.paginas, motivo: a.combinado!.motivo,
  }));
  if (!filas.length) return;
  const { error } = await db.from("correo_documentos_combinados").upsert(filas, { onConflict: "storage_path", ignoreDuplicates: true });
  if (error) console.error("No se pudo encolar documento combinado", error.message);
}

const nombreSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ]+/g, "_").slice(-120);

const texto = (max: number) => z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string().trim().max(max));

const schema = z.object({
  remitente: texto(500),
  asunto: texto(1000),
  cuerpo: texto(200_000),
  destinatarios: texto(2000).optional(),
  cc: texto(2000).optional(),
  id_hilo: texto(500).optional(),
  id_mensaje: texto(300).optional(),
  adjuntos: z.unknown().optional(),
}).refine((d) => d.cuerpo || d.asunto || (Array.isArray(d.adjuntos) && d.adjuntos.length), { message: "Correo vacío" });

/** Acepta los alias habituales del remitente (para/to, con_copia/copia) sin rechazar el correo. */
export function normalizarDestinatarios(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  return {
    ...b,
    destinatarios: b.destinatarios ?? b.para ?? b.to ?? b.destinatario,
    cc: b.cc ?? b.con_copia ?? b.copia ?? b.conCopia,
    id_hilo: b.id_hilo ?? b.idHilo ?? b.threadId ?? b.thread_id ?? b.hilo,
    id_mensaje: b.id_mensaje ?? b.idMensaje ?? b.messageId ?? b.message_id ?? b.mensaje_id,
  };
}



const JSON_SCHEMA = {
  name: "solicitud_correo",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["es_solicitud_nueva", "duda", "motivo", "bl_awb", "eta", "producto", "cantidad", "cliente_nombre"],
    properties: {
      es_solicitud_nueva: { type: "boolean" },
      duda: { type: "boolean" },
      motivo: { type: "string" },
      bl_awb: { type: ["string", "null"] },
      eta: { type: ["string", "null"] },
      producto: { type: ["string", "null"] },
      cantidad: { type: ["string", "null"] },
      cliente_nombre: { type: ["string", "null"] },
    },
  },
};

const PROMPT = `Eres asistente de una agencia aduanal dominicana. Recibes SOLO el mensaje más reciente de un correo.
Decide si es una SOLICITUD NUEVA de compra, cotización, gestión aduanal o logística (p. ej. "favor cotizar esta proforma / proceder con el trámite / despacho / VUCE de esta carga").
También ES solicitud nueva un correo en el que el cliente remite los documentos de un embarque o importación (factura, BL, packing list, certificados), aunque no pida nada explícitamente, mencione un número de trámite VUCE ya solicitado, liste pendientes o indique la fecha de llegada: así nos entregan los embarques nuevos. Un número de trámite VUCE NO indica que el embarque ya esté registrado con nosotros.
NO es solicitud nueva: preguntas o respuestas sobre un trámite ya en curso, confirmaciones, facturas de proveedores de servicios, correspondencia general, publicidad o spam.
"duda" = true si no estás seguro entre seguimiento y solicitud nueva.
Si lo es, copia literalmente del texto: BL/AWB, ETA o fecha de llegada (tal como aparece), producto/descripción, cantidad y nombre del cliente (de la firma o remitente).
Usa null para todo dato que no aparezca. Nunca inventes ni deduzcas valores.`;

async function clasificar(asunto: string, remitente: string, mensaje: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw Object.assign(new Error("Falta LOVABLE_API_KEY"), { status: 500 });
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `Remitente: ${remitente}\nAsunto: ${asunto}\n\nMensaje:\n${mensaje}` },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw Object.assign(new Error(`IA no disponible (${res.status}): ${txt.slice(0, 300)}`), { status: res.status === 429 || res.status >= 500 ? 503 : res.status });
  }
  const data = (await res.json()) as any;
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}

export const correoDe = (r: string) => r.match(/[^\s<>"]+@[^\s<>"]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null;
const hoySantoDomingo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
export const RESULTADO_LEGADO: Record<string, string> = { creada: "borrador", actualizada: "actualizado", adjuntada: "adjuntado", descartada: "descartado" };
export const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export type CamposBitacora = {
  resultado: "creada" | "actualizada" | "adjuntada" | "descartada" | "error";
  motivo?: string | null; reintentable?: boolean; solicitud_id?: string | null; expediente_id?: string | null;
  expediente_numero?: string | null; vinculo?: "numero" | "bl" | "vuce" | null; advertencias?: string[]; propuestas?: Record<string, unknown>;
  adjuntos_respaldo?: { nombre: string; mime: string; bytes: number; storage_path: string }[];
};

export type ResultadoProceso =
  | { tipo: "ok"; campos: CamposBitacora; respuesta: Record<string, unknown> }
  | { tipo: "fallo"; status: number; motivo: string; reintentar: boolean };

const bytesBase64 = (b64: string) => Math.floor((b64.replace(/^data:[^,]*,/, "").replace(/\s/g, "").length * 3) / 4);

/**
 * Procesa un correo ya registrado en `correos_recibidos`: lo relaciona con un Expediente (número,
 * trámite VUCE o BL), crea/actualiza la solicitud o, solo si no hay nada que revisar, lo descarta
 * guardando sus adjuntos para poder crear la solicitud más tarde. `forzado` = creado a mano desde el
 * registro (nunca descarta). Compartido por el webhook de Gmail y la recuperación manual.
 */
export async function procesarCorreo(db: any, normal: Record<string, unknown> | undefined, opciones: { registroId: string; forzado?: boolean }): Promise<ResultadoProceso> {
  const fallo = (status: number, motivo: string, reintentar = true): ResultadoProceso => ({ tipo: "fallo", status, motivo, reintentar });
  const ok = (campos: CamposBitacora, respuesta: Record<string, unknown>): ResultadoProceso => ({ tipo: "ok", campos, respuesta });

  const p = schema.safeParse(normal);
  if (!p.success) return fallo(400, `Faltan remitente/asunto/cuerpo válidos: ${p.error.issues.map((i) => `${i.path.join(".") || "correo"}: ${i.message}`).join("; ")}`, false);
  const { remitente, asunto, cuerpo } = p.data;
  const remitenteCorreo = correoDe(remitente);
  const entradaAdjuntos = normalizarAdjuntosCorreo(p.data.adjuntos);
  // Mismo archivo repetido (nombre, o contenido idéntico): se procesa una sola vez.
  const adjuntosIn = deduplicarAdjuntosCorreo(entradaAdjuntos.adjuntos.map((a) => ({ ...a, file_hash: a.contenido.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") }))).map(({ file_hash: _h, ...a }) => a);
  const omitidos = Array.isArray(normal?.adjuntos_omitidos) ? (normal!.adjuntos_omitidos as any[]) : [];
  for (const o of omitidos.slice(0, 20)) {
    entradaAdjuntos.advertencias.push(`${str(o?.nombre) || "Adjunto"}: no llegó a la plataforma (${str(o?.motivo) || "omitido por el buzón"}); descárgalo del correo original en Gmail.`);
  }
  const adjuntosEnGmail = Number.isFinite(Number(normal?.adjuntos_en_gmail)) ? Number(normal?.adjuntos_en_gmail) : null;

  const mensaje = aislarMensajeReciente(cuerpo);
  if (!mensaje && !asunto && !adjuntosIn.length && !opciones.forzado) return ok({ resultado: "descartada", motivo: "Mensaje vacío", advertencias: entradaAdjuntos.advertencias }, { advertencias: entradaAdjuntos.advertencias });

  // 1) Número de Expediente en asunto (o cuerpo): un embarque ya registrado nunca crea solicitud nueva.
  const avisos: string[] = [];
  let destino: ExpedienteCorreo | null = null;
  let vinculo: "numero" | "bl" | "vuce" | null = null;
  const COMO = { numero: "menciona el Expediente", bl: "trae el BL del Expediente", vuce: "trae el trámite VUCE del Expediente" } as const;
  const relacionar = async (exp: ExpedienteCorreo, como: "numero" | "bl" | "vuce") => {
    const r = await verificarRemitente(db, exp, remitenteCorreo);
    if (r.corresponde) { destino = exp; vinculo = como; return; }
    avisos.push(`El correo ${COMO[como]} ${exp.numero}${exp.cliente_nombre ? ` (${exp.cliente_nombre})` : ""}, pero ${r.motivo}; revisar antes de vincular.`);
  };
  const { numeros, origen } = numerosExpedienteCorreo(asunto, mensaje, cuerpo);
  if (numeros.length) {
    const encontrados = await expedientesPorNumero(db, numeros);
    if (encontrados.length === 1) {
      const exp = await contextoExpediente(db, encontrados[0].id);
      if (exp) await relacionar(exp, "numero");
    } else if (encontrados.length > 1) avisos.push(`El correo menciona varios Expedientes (${encontrados.map((e) => e.numero).join(", ")}); revisar a cuál corresponde.`);
    else avisos.push(`El ${origen} menciona el Expediente ${numeros.join(", ")}, que no existe en la plataforma.`);
  }
  const numeroVuce = extraerNumeroVuce(asunto) ?? extraerNumeroVuce(mensaje);
  // 1b) Trámite VUCE ya registrado en un Expediente: mismo embarque. Si no está registrado, es normal
  // que un embarque nuevo llegue con su trámite ya solicitado; no indica nada por sí solo.
  if (!destino && !numeros.length && numeroVuce) {
    const porVuce = await expedientesPorVuce(db, numeroVuce);
    if (porVuce.length === 1) { const exp = await contextoExpediente(db, porVuce[0].id); if (exp) await relacionar(exp, "vuce"); }
    else if (porVuce.length > 1) avisos.push(`El trámite VUCE ${numeroVuce} figura en varios Expedientes (${porVuce.map((e) => e.numero).join(", ")}); revisar a cuál corresponde.`);
  }

  // 2) Clasificación con IA solo si no está ya relacionado con un Expediente.
  let ia: any = {};
  if (!destino) {
    try { ia = await clasificar(asunto, remitente, mensaje); }
    catch (e: any) { return fallo(e.status && e.status < 500 && e.status !== 429 ? 502 : 503, e.message, true); }
  }
  const correo = fusionarAsunto(combinarDatos(extraerPorEtiquetas(mensaje), ia, mensaje, remitente), asunto);
  const avisoFecha = avisoFechaLlegada(mensaje);
  if (avisoFecha) correo.advertencias.push(avisoFecha);

  // 3) Respaldo por BL del asunto/cuerpo cuando no hay número de Expediente.
  let blProbado: string | null = null;
  const probarBl = async (bl: string | null) => {
    if (destino || numeros.length || !bl || normalizarBl(bl) === blProbado) return;
    blProbado = normalizarBl(bl);
    const porBl = await expedientesPorBl(db, bl);
    if (porBl.length === 1) { const exp = await contextoExpediente(db, porBl[0].id); if (exp) await relacionar(exp, "bl"); }
    else if (porBl.length > 1) avisos.push(`El BL ${bl} figura en varios Expedientes (${porBl.map((e) => e.numero).join(", ")}); revisar a cuál corresponde.`);
  };
  await probarBl(correo.datos.bl_awb);

  // Solo se descarta lo que no trae documentos ni dudas; todo lo demás lo ve una persona.
  if (!destino) {
    // A later shipping reply in an already converted purchase thread must remain
    // available for manual linking, never be silently discarded as follow-up.
    const { data: compraHilo } = p.data.id_hilo ? await db.from("solicitudes_correo").select("id").eq("id_hilo", p.data.id_hilo).eq("estado", "convertida").not("cotizacion_id", "is", null).limit(1) : { data: [] };
    const documentos = adjuntosIn.filter((a) => esDocumentoAdjunto({ nombre: a.nombre, mime: mimeAdjuntoCorreo(a.nombre, a.tipo, a.contenido), bytes: bytesBase64(a.contenido) })).length;
    const decision = decidirCorreoSinExpediente({
      esSolicitudNueva: ia?.es_solicitud_nueva === true, dudaIa: ia?.duda === true, motivoIa: ia?.motivo ?? null, forzado: opciones.forzado,
      otrosAvisos: avisos.length > 0, hiloCompra: (compraHilo?.length ?? 0) > 0, documentos, adjuntosRecibidos: adjuntosIn.length,
      adjuntosEnGmail: adjuntosEnGmail != null ? Math.max(adjuntosEnGmail, adjuntosIn.length + omitidos.length) : omitidos.length ? adjuntosIn.length + omitidos.length : null,
      texto: `${asunto}\n${mensaje}`,
    });
    if (decision.descartar) {
      // Se guardan los adjuntos originales para poder crear la solicitud desde el registro.
      const respaldo: NonNullable<CamposBitacora["adjuntos_respaldo"]> = [];
      for (const [i, a] of adjuntosIn.entries()) {
        let bytes: Uint8Array;
        try { bytes = Uint8Array.from(atob(a.contenido.replace(/^data:[^,]*,/, "").replace(/\s/g, "")), (c) => c.charCodeAt(0)); } catch { continue; }
        const mime = mimeAdjuntoCorreo(a.nombre, a.tipo, a.contenido) || "application/octet-stream";
        const path = `correo-recibido/${opciones.registroId}/${i}_${nombreSeguro(a.nombre)}`;
        const up = await db.storage.from("documentos").upload(path, new Blob([bytes as BlobPart], { type: mime }), { contentType: mime, upsert: true });
        if (up.error) return fallo(500, `No se pudo guardar el adjunto ${a.nombre} del correo descartado: ${up.error.message}`);
        respaldo.push({ nombre: a.nombre, mime, bytes: bytes.length, storage_path: path });
      }
      return ok({ resultado: "descartada", motivo: decision.motivo, advertencias: entradaAdjuntos.advertencias, adjuntos_respaldo: respaldo }, { motivo: decision.motivo });
    }
    avisos.unshift(...decision.avisos);
  }

  // Un adjunto ilegible no bloquea a los demás: queda como «Otro».
  const adjuntos: AdjuntoProcesado[] = [];
  for (const a of adjuntosIn) adjuntos.push(await leerAdjunto(a));
  const { datos, advertencias } = fusionarAdjuntos(correo.datos, [...correo.advertencias, ...entradaAdjuntos.advertencias], adjuntos);
  for (const a of adjuntos) if (a.combinado) advertencias.push(`${a.nombre}: ${AVISO_PROCESANDO_COMBINADO} (${a.combinado.paginas ?? "varias"} páginas); se separará por tipo en segundo plano.`);
  for (const a of adjuntos) if (a.error) advertencias.push(`${a.nombre}: no se pudo leer el documento; ${a.bytes.length ? "se conserva en Otros documentos" : "reenvía el archivo"}. ${a.error}`);

  // 4) BL leído de los documentos adjuntos (p. ej. "SMLU 9221768A" = "SMLU9221768A"): un Expediente
  // registrado tiene prioridad sobre fusionar con un borrador pendiente del mismo BL.
  await probarBl(datos.bl_awb);

  const subirAdjuntos = async (carpeta: string) => {
    for (const [i, a] of adjuntos.entries()) {
      if (!a.bytes.length) continue;
      const path = `${carpeta}/${Date.now()}_${i}_${nombreSeguro(a.nombre)}`;
      const up = await db.storage.from("documentos").upload(path, new Blob([a.bytes as BlobPart], { type: a.mime || "application/octet-stream" }), { contentType: a.mime || undefined });
      if (up.error) throw new Error(`No se pudo guardar el adjunto ${a.nombre}: ${up.error.message}`);
      a.storage_path = path;
    }
  };
  const resumenAdjuntos = () => adjuntos.filter((a) => a.storage_path).map((a) => ({ nombre: a.nombre, mime: a.mime, tipo: a.tipo, storage_path: a.storage_path, datos: a.datos ?? {}, ...(a.firmado ? { firmado: true } : {}), ...(a.error ? { error: a.error } : {}), ...(a.combinado ? { procesando: true, combinado: a.combinado } : {}) }));

  const exp = destino as ExpedienteCorreo | null;
  if (exp) {
    // Expediente existente: documentos al Expediente, registro en Seguimientos y datos faltantes por confirmar.
    const textoCompleto = `De: ${remitente}\nAsunto: ${asunto}\nRecibido: ${new Date().toISOString()}\n\n${cuerpo}`;
    const path = `${exp.id}/${Date.now()}_correo_solicitud.txt`;
    const up = await db.storage.from("documentos").upload(path, new Blob([textoCompleto], { type: "text/plain;charset=utf-8" }));
    if (up.error) return fallo(500, `No se pudo guardar el correo: ${up.error.message}`);
    const hoy = hoySantoDomingo();
    const { error: errorCorreo } = await db.from("documentos").insert({
      expediente_id: exp.id, tipo: "Otro", storage_path: path, estado: "recibido", fecha_recepcion: hoy,
      observaciones: `Correo recibido${asunto ? `: ${asunto}` : ""}`.slice(0, 500),
    });
    if (errorCorreo) return fallo(500, `No se pudo registrar el correo en el Expediente: ${errorCorreo.message}`);
    await subirAdjuntos(exp.id);
    const filas = resumenAdjuntos().map((a) => ({
      expediente_id: exp.id, tipo: a.tipo, storage_path: a.storage_path, estado: "recibido", fecha_recepcion: hoy,
      observaciones: `Adjunto de correo: ${a.nombre}`.slice(0, 500),
    }));
    if (filas.length) {
      const { data: insertados, error: e2 } = await db.from("documentos").insert(filas).select("id,storage_path");
      if (e2) return fallo(500, `No se pudieron registrar los adjuntos: ${e2.message}`);
      await encolarCombinados(db, adjuntos, { expediente_id: exp.id, documentos: new Map((insertados ?? []).map((d: any) => [d.storage_path, d.id])) });
    }
    const prop = propuestasParaExpediente(exp, { bl_awb: datos.bl_awb, numero_vuce: numeroVuce, eta: datos.eta }, hoy);
    // El nombre del cliente ya lo fija el Expediente: su aviso de diferencia no aplica aquí.
    const todas = [...advertencias.filter((a) => !a.startsWith("Cliente:")), ...prop.advertencias];
    const v = vinculo as "numero" | "bl" | "vuce" | null;
    const como = v === "bl" ? "por BL" : v === "vuce" ? "por trámite VUCE" : "por número en el correo";
    return ok(
      { resultado: "adjuntada", motivo: `Adjuntado al Expediente ${exp.numero} (${como})`, expediente_id: exp.id, expediente_numero: exp.numero, vinculo: v, advertencias: todas, propuestas: prop.propuestas },
      { expediente: exp.numero, expediente_id: exp.id, adjuntos: filas.map((f) => f.tipo), propuestas: Object.keys(prop.propuestas), advertencias: todas },
    );
  }

  let clienteId: string | null = null;
  if (datos.cliente_nombre) {
    const nombreCliente = datos.cliente_nombre.split(",")[0].replace(/[%_]/g, "").trim();
    const { data: c } = await db.from("clientes").select("id").ilike("nombre", `%${nombreCliente}%`).limit(2);
    if (c?.length === 1) clienteId = c[0].id;
  }

  await subirAdjuntos(`correo/${crypto.randomUUID()}`);
  const listaAdjuntos = resumenAdjuntos();
  const advertenciasFinales = [...avisos, ...advertencias];
  // Revalidación atómica: dos entregas simultáneas solo pueden crear una fila.
  const { data: guardado, error: errorGuardado } = await db.rpc("guardar_solicitud_correo_pendiente", { p_solicitud: {
    remitente, remitente_correo: remitenteCorreo, asunto, cuerpo, mensaje_aislado: mensaje,
    destinatarios: p.data.destinatarios || null, cc: p.data.cc || null, id_hilo: p.data.id_hilo || null,
    ...datos, advertencias: advertenciasFinales, cliente_id: clienteId, adjuntos: listaAdjuntos,
  } });
  if (errorGuardado) return fallo(500, `No se pudo guardar la solicitud: ${errorGuardado.message}`);
  if (!guardado?.id) return fallo(500, "No se pudo guardar el borrador");
  await encolarCombinados(db, adjuntos, { solicitud_id: guardado.id });
  if (guardado.actualizado) {
    return ok({ resultado: "actualizada", motivo: "Borrador pendiente actualizado con el reenvío", solicitud_id: guardado.id, advertencias: advertenciasFinales }, { id: guardado.id });
  }
  return ok(
    { resultado: "creada", motivo: avisos.length ? avisos[0] : "Solicitud nueva creada", solicitud_id: guardado.id, advertencias: advertenciasFinales },
    { id: guardado.id, datos, advertencias: advertenciasFinales, adjuntos: listaAdjuntos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })) },
  );
}
