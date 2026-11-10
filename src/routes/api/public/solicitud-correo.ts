import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aislarMensajeReciente, combinarDatos, extraerPorEtiquetas, fusionarAsunto, fusionarAdjuntos } from "@/lib/correo-solicitud";
import { adjuntoCorreoSchema, normalizarAdjuntosCorreo, mimeAdjuntoCorreo, deduplicarAdjuntosCorreo } from "@/lib/correo-adjuntos";
import { claveCorreo, conservarPorDocumentos, ETIQUETA_ERROR, ETIQUETA_OK, extraerNumeroVuce, normalizarBl, numerosExpedienteCorreo, propuestasParaExpediente } from "@/lib/correo-expediente";
import { contextoExpediente, expedientesPorBl, expedientesPorNumero, remitenteEsCliente, verificarRemitente, type ExpedienteCorreo } from "@/lib/correo-recepcion.server";
import { autorizadoWebhook } from "@/lib/webhook-auth";
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
function normalizarDestinatarios(body: unknown) {
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
    required: ["es_solicitud_nueva", "motivo", "bl_awb", "eta", "producto", "cantidad", "cliente_nombre"],
    properties: {
      es_solicitud_nueva: { type: "boolean" },
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
NO es solicitud nueva: seguimientos, preguntas, confirmaciones, facturas, correspondencia general, publicidad o spam.
Si lo es, copia literalmente del texto: BL/AWB, ETA (tal como aparece), producto/descripción, cantidad y nombre del cliente (de la firma o remitente).
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

const correoDe = (r: string) => r.match(/[^\s<>"]+@[^\s<>"]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null;
const hoySantoDomingo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
const RESULTADO_LEGADO: Record<string, string> = { creada: "borrador", actualizada: "actualizado", adjuntada: "adjuntado", descartada: "descartado" };
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

type CamposBitacora = {
  resultado: "creada" | "actualizada" | "adjuntada" | "descartada" | "error";
  motivo?: string | null; reintentable?: boolean; solicitud_id?: string | null; expediente_id?: string | null;
  expediente_numero?: string | null; vinculo?: "numero" | "bl" | null; advertencias?: string[]; propuestas?: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/solicitud-correo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const error = (status: number, motivo: string, reintentar: boolean, extra: Record<string, unknown> = {}) =>
          Response.json({ ok: false, resultado: "error", etiqueta: ETIQUETA_ERROR, motivo, error: motivo, reintentar, ...extra }, { status });
        if (!autorizadoWebhook(request)) return error(401, "No autorizado", false);

        let body: unknown;
        try { body = await request.json(); } catch { return error(400, "JSON inválido", false); }
        const normal = normalizarDestinatarios(body) as Record<string, unknown> | undefined;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        // Cada entrega queda registrada antes de procesar; ningún correo puede perderse en silencio.
        const remitenteCrudo = str(normal?.remitente).slice(0, 500);
        const asuntoCrudo = str(normal?.asunto).slice(0, 1000);
        const adjuntosCrudos = Array.isArray(normal?.adjuntos) ? (normal!.adjuntos as any[]) : [];
        const clave = await claveCorreo({
          id_mensaje: str(normal?.id_mensaje).slice(0, 300) || null, remitente: remitenteCrudo, asunto: asuntoCrudo,
          cuerpo: str(normal?.cuerpo), adjuntos: adjuntosCrudos.map((a) => str(a?.nombre ?? a?.name ?? a?.filename)),
        });
        const { data: intento, error: errorIntento } = await db.rpc("registrar_intento_correo", { p: {
          clave, id_mensaje: str(normal?.id_mensaje).slice(0, 300) || null, id_hilo: str(normal?.id_hilo).slice(0, 500) || null,
          remitente: remitenteCrudo, remitente_correo: correoDe(remitenteCrudo), asunto: asuntoCrudo, adjuntos_total: adjuntosCrudos.length,
        } });
        if (errorIntento || !intento?.id) {
          console.error("No se pudo registrar el correo recibido", errorIntento?.message);
          return error(503, "No se pudo registrar el correo en la plataforma", true);
        }
        const registro_id: string = intento.id;
        if (intento.ya_procesado) {
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, ya_procesado: true, resultado: RESULTADO_LEGADO[intento.resultado] ?? intento.resultado,
            id: intento.solicitud_id ?? undefined, expediente: intento.expediente_numero ?? undefined, motivo: intento.motivo ?? "Correo ya procesado anteriormente" });
        }
        if (intento.en_proceso) return error(409, "El mismo correo se está procesando en otro intento", true, { registro_id });

        const finalizar = async (c: CamposBitacora) => {
          const { error: e } = await db.from("correos_recibidos").update({
            resultado: c.resultado, motivo: c.motivo?.slice(0, 1000) ?? null, reintentable: c.reintentable ?? true,
            solicitud_id: c.solicitud_id ?? null, expediente_id: c.expediente_id ?? null, expediente_numero: c.expediente_numero ?? null,
            vinculo: c.vinculo ?? null, advertencias: (c.advertencias ?? []).slice(0, 50), propuestas: c.propuestas ?? {},
            ...(c.resultado === "error" ? { alerta_vista_en: null, alerta_vista_por: null } : {}),
          }).eq("id", registro_id);
          if (e) console.error("No se pudo cerrar el registro del correo", registro_id, e.message);
        };
        const exito = async (c: CamposBitacora, respuesta: Record<string, unknown>) => {
          await finalizar(c);
          return Response.json({ ok: true, etiqueta: ETIQUETA_OK, registro_id, resultado: RESULTADO_LEGADO[c.resultado], motivo: c.motivo ?? undefined, ...respuesta });
        };
        const fallo = async (status: number, motivo: string, reintentar = true) => {
          await finalizar({ resultado: "error", motivo, reintentable: reintentar });
          return error(status, motivo, reintentar, { registro_id });
        };

        try {
          const p = schema.safeParse(normal);
          if (!p.success) return await fallo(400, `Faltan remitente/asunto/cuerpo válidos: ${p.error.issues.map((i) => `${i.path.join(".") || "correo"}: ${i.message}`).join("; ")}`, false);
          const { remitente, asunto, cuerpo } = p.data;
          const remitenteCorreo = correoDe(remitente);
          const entradaAdjuntos = normalizarAdjuntosCorreo(p.data.adjuntos);
          // Mismo archivo repetido (nombre, o contenido idéntico): se procesa una sola vez.
          const adjuntosIn = deduplicarAdjuntosCorreo(entradaAdjuntos.adjuntos.map((a) => ({ ...a, file_hash: a.contenido.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") }))).map(({ file_hash: _h, ...a }) => a);

          const mensaje = aislarMensajeReciente(cuerpo);
          if (!mensaje && !asunto && !adjuntosIn.length) return await exito({ resultado: "descartada", motivo: "Mensaje vacío", advertencias: entradaAdjuntos.advertencias }, { advertencias: entradaAdjuntos.advertencias });

          // 1) Número de Expediente en asunto (o cuerpo): un embarque ya registrado nunca crea solicitud nueva.
          const avisos: string[] = [];
          let destino: ExpedienteCorreo | null = null;
          let vinculo: "numero" | "bl" | null = null;
          const relacionar = async (exp: ExpedienteCorreo, como: "numero" | "bl") => {
            const r = await verificarRemitente(db, exp, remitenteCorreo);
            if (r.corresponde) { destino = exp; vinculo = como; return; }
            avisos.push(`El correo ${como === "numero" ? "menciona el Expediente" : "trae el BL del Expediente"} ${exp.numero}${exp.cliente_nombre ? ` (${exp.cliente_nombre})` : ""}, pero ${r.motivo}; revisar antes de vincular.`);
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

          // 2) Clasificación con IA solo si no está ya relacionado con un Expediente.
          let ia: any = {};
          if (!destino) {
            try { ia = await clasificar(asunto, remitente, mensaje); }
            catch (e: any) { return await fallo(e.status && e.status < 500 && e.status !== 429 ? 502 : 503, e.message, true); }
          }
          const correo = fusionarAsunto(combinarDatos(extraerPorEtiquetas(mensaje), ia, mensaje, remitente), asunto);

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

          // A later shipping reply in an already converted purchase thread must remain
          // available for manual linking, never be silently discarded as follow-up.
          const { data: compraHilo } = p.data.id_hilo ? await db.from("solicitudes_correo").select("id").eq("id_hilo", p.data.id_hilo).eq("estado", "convertida").not("cotizacion_id", "is", null).limit(1) : { data: [] };
          if (!destino && !ia?.es_solicitud_nueva && !compraHilo?.length && !avisos.length) {
            const mimes = adjuntosIn.map((a) => mimeAdjuntoCorreo(a.nombre, a.tipo, a.contenido));
            if (!conservarPorDocumentos(asunto, mimes, await remitenteEsCliente(db, remitenteCorreo))) {
              const motivo = ia?.motivo || "No es una solicitud nueva";
              return await exito({ resultado: "descartada", motivo }, { motivo });
            }
            avisos.push(`La IA lo consideró seguimiento (${ia?.motivo || "sin motivo"}); se registró porque trae documentos de importación adjuntos.`);
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
            if (up.error) return await fallo(500, `No se pudo guardar el correo: ${up.error.message}`);
            const hoy = hoySantoDomingo();
            const { error: errorCorreo } = await db.from("documentos").insert({
              expediente_id: exp.id, tipo: "Otro", storage_path: path, estado: "recibido", fecha_recepcion: hoy,
              observaciones: `Correo recibido${asunto ? `: ${asunto}` : ""}`.slice(0, 500),
            });
            if (errorCorreo) return await fallo(500, `No se pudo registrar el correo en el Expediente: ${errorCorreo.message}`);
            await subirAdjuntos(exp.id);
            const filas = resumenAdjuntos().map((a) => ({
              expediente_id: exp.id, tipo: a.tipo, storage_path: a.storage_path, estado: "recibido", fecha_recepcion: hoy,
              observaciones: `Adjunto de correo: ${a.nombre}`.slice(0, 500),
            }));
            if (filas.length) {
              const { data: insertados, error: e2 } = await db.from("documentos").insert(filas).select("id,storage_path");
              if (e2) return await fallo(500, `No se pudieron registrar los adjuntos: ${e2.message}`);
              await encolarCombinados(db, adjuntos, { expediente_id: exp.id, documentos: new Map((insertados ?? []).map((d: any) => [d.storage_path, d.id])) });
            }
            const prop = propuestasParaExpediente(exp, { bl_awb: datos.bl_awb, numero_vuce: numeroVuce, eta: datos.eta }, hoy);
            // El nombre del cliente ya lo fija el Expediente: su aviso de diferencia no aplica aquí.
            const todas = [...advertencias.filter((a) => !a.startsWith("Cliente:")), ...prop.advertencias];
            return await exito(
              { resultado: "adjuntada", motivo: `Adjuntado al Expediente ${exp.numero} (${(vinculo as string | null) === "bl" ? "por BL" : "por número en el correo"})`, expediente_id: exp.id, expediente_numero: exp.numero, vinculo, advertencias: todas, propuestas: prop.propuestas },
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
          if (errorGuardado) return await fallo(500, `No se pudo guardar la solicitud: ${errorGuardado.message}`);
          if (!guardado?.id) return await fallo(500, "No se pudo guardar el borrador");
          await encolarCombinados(db, adjuntos, { solicitud_id: guardado.id });
          if (guardado.actualizado) {
            return await exito({ resultado: "actualizada", motivo: "Borrador pendiente actualizado con el reenvío", solicitud_id: guardado.id, advertencias: advertenciasFinales }, { id: guardado.id });
          }
          return await exito(
            { resultado: "creada", motivo: avisos.length ? avisos[0] : "Solicitud nueva creada", solicitud_id: guardado.id, advertencias: advertenciasFinales },
            { id: guardado.id, datos, advertencias: advertenciasFinales, adjuntos: listaAdjuntos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })) },
          );
        } catch (e: any) {
          console.error("Error procesando correo", registro_id, e?.message ?? e);
          return await fallo(500, String(e?.message ?? e).slice(0, 500) || "Error inesperado");
        }
      },
    },
  },
});
