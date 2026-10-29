import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aislarMensajeReciente, combinarDatos, extraerPorEtiquetas, fusionarAsunto, fusionarAdjuntos, tipoAdjuntoCorreo, TIPOS_ADJUNTO_CORREO, type DatosAdjunto } from "@/lib/correo-solicitud";
import { PROMPT_DOCUMENTO_IMPORTACION } from "@/lib/ocr-documento-prompt";
import { callGateway } from "@/lib/ai-gateway.server";
import { adjuntoCorreoSchema, normalizarAdjuntosCorreo, mimeAdjuntoCorreo, deduplicarAdjuntosCorreo } from "@/lib/correo-adjuntos";
import { mismoPendienteCorreo, respuestaCorreoActualizado } from "@/lib/correo-duplicados";
import { autorizadoWebhook } from "@/lib/webhook-auth";

const adjuntoSchema = adjuntoCorreoSchema;

type AdjuntoProcesado = DatosAdjunto & { nombre: string; mime: string; bytes: Uint8Array; storage_path?: string; error?: string; datos?: Record<string, unknown> };

const MIME_OK = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;

/** Reutiliza el reconocimiento de Nuevo Expediente y añade la clasificación del tipo de documento. */
async function leerAdjunto(a: z.infer<typeof adjuntoSchema>): Promise<AdjuntoProcesado> {
  const base64 = a.contenido.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  const mime = mimeAdjuntoCorreo(a.nombre, a.tipo, a.contenido);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); }
  catch { return { tipo: "Otro", nombre: a.nombre, mime, bytes: new Uint8Array(), error: "Contenido base64 inválido" }; }
  const base: AdjuntoProcesado = { tipo: "Otro", nombre: a.nombre, mime, bytes };
  if (!MIME_OK.test(mime)) return base;
  try {
    const dataUrl = `data:${mime};base64,${base64}`;
    const raw = await callGateway({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT_DOCUMENTO_IMPORTACION + ` Agrega también la clave 'tipo_documento': exactamente uno de ${TIPOS_ADJUNTO_CORREO.map((t) => `'${t}'`).join(", ")} u 'Otro' si el documento no es ninguno de ellos. Agrega 'cantidad': la cantidad total de bultos/unidades tal como aparece (ej. '2,000 BAGS'), o null.` },
        { role: "user", content: [
          { type: "text", text: "Extrae los campos del documento adjunto." },
          mime === "application/pdf"
            ? { type: "file", file: { filename: a.nombre, file_data: dataUrl } }
            : { type: "image_url", image_url: { url: dataUrl } },
        ] as any },
      ],
    });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const tipo = tipoAdjuntoCorreo(j.tipo_documento);
    // Same OCR implementation as Escanear Factura, after webhook authorization.
    if (tipo === "Factura comercial" || tipo === "Factura proforma") {
      const { leerDocumentoImportacion } = await import("@/lib/ai-ocr.server");
      try {
        Object.assign(j, await leerDocumentoImportacion({ filename: a.nombre, mime, base64, lineas_factura: true }));
      } catch (error) {
        return { ...base, tipo, datos: j, error: `Factura reconocida; lectura de mercancías pendiente: ${String(error instanceof Error ? error.message : error).slice(0, 160)}` };
      }
    }
    const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      ...base,
      tipo,
      bl_awb: txt(j.bl),
      eta: txt(j.eta),
      cliente_nombre: txt(j.cliente),
      producto: txt(j.productos) ?? txt(j.descripcion_mercancia),
      cantidad: txt(j.cantidad),
      peso_bruto_kg: j.peso_bruto_kg != null && !isNaN(Number(j.peso_bruto_kg)) ? Number(j.peso_bruto_kg) : null,
      factura_comercial: txt(j.factura_comercial),
      datos: Object.fromEntries(["tipo_carga", "tipo_carga_confianza", "contenedores", "suplidor", "medio_transporte", "naviera", "buque", "puerto_arribo", "puerto_salida", "pais_origen", "pais_procedencia", "incoterm", "peso_neto_kg", "fecha_cargado", "fob_total", "seguro", "flete", "otros_gastos", "lineas_factura"].map((k) => [k, j[k] ?? null])),
    };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
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
Decide si es una SOLICITUD NUEVA de servicio de gestión aduanal o logística (p. ej. "favor proceder con el trámite / despacho / VUCE de esta carga").
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

export const Route = createFileRoute("/api/public/solicitud-correo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!autorizadoWebhook(request)) return Response.json({ error: "No autorizado" }, { status: 401 });

        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
        const p = schema.safeParse(normalizarDestinatarios(body));
        if (!p.success) return Response.json({ error: "Faltan remitente/asunto/cuerpo válidos", detalle: p.error.issues.map((i) => `${i.path.join(".") || "correo"}: ${i.message}`) }, { status: 400 });
        const { remitente, asunto, cuerpo } = p.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const entradaAdjuntos = normalizarAdjuntosCorreo(p.data.adjuntos);
        // Mismo archivo repetido (nombre, o contenido idéntico): se procesa una sola vez.
        const adjuntosIn = deduplicarAdjuntosCorreo(entradaAdjuntos.adjuntos.map((a) => ({ ...a, file_hash: a.contenido.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") }))).map(({ file_hash: _h, ...a }) => a);

        const mensaje = aislarMensajeReciente(cuerpo);
        if (!mensaje && !asunto && !adjuntosIn.length) return Response.json({ resultado: "descartado", motivo: "Mensaje vacío", advertencias: entradaAdjuntos.advertencias });

        let ia: any;
        try { ia = await clasificar(asunto, remitente, mensaje); }
        catch (e: any) { return Response.json({ error: e.message }, { status: e.status ?? 500 }); }
        if (!ia?.es_solicitud_nueva) return Response.json({ resultado: "descartado", motivo: ia?.motivo ?? "No es una solicitud nueva" });

        const correo = fusionarAsunto(combinarDatos(extraerPorEtiquetas(mensaje), ia, mensaje, remitente), asunto);
        // Un adjunto ilegible no bloquea a los demás: queda como «Otro».
        const adjuntos: AdjuntoProcesado[] = [];
        for (const a of adjuntosIn) adjuntos.push(await leerAdjunto(a));
        const { datos, advertencias } = fusionarAdjuntos(correo.datos, [...correo.advertencias, ...entradaAdjuntos.advertencias], adjuntos);
        for (const a of adjuntos) if (a.error) advertencias.push(`${a.nombre}: no se pudo leer el documento; ${a.bytes.length ? "se conserva en Otros documentos" : "reenvía el archivo"}. ${a.error}`);
        const remitenteCorreo = correoDe(remitente);
        // OCR must run before matching: a retry may complete missing invoice lines.
        const { data: pendientes, error: errorPendientes } = await db.from("solicitudes_correo")
          .select("id,remitente,remitente_correo,asunto,bl_awb,estado").eq("estado", "pendiente");
        if (errorPendientes) return Response.json({ error: "No se pudo verificar el borrador pendiente" }, { status: 500 });
        const pendiente = (pendientes ?? []).find((s: Parameters<typeof mismoPendienteCorreo>[0]) => mismoPendienteCorreo(s, { remitente, remitente_correo: remitenteCorreo, asunto, bl_awb: datos.bl_awb }));

        const subirAdjuntos = async (carpeta: string) => {
          for (const [i, a] of adjuntos.entries()) {
            if (!a.bytes.length) continue;
            const path = `${carpeta}/${Date.now()}_${i}_${nombreSeguro(a.nombre)}`;
            const up = await db.storage.from("documentos").upload(path, new Blob([a.bytes as BlobPart], { type: a.mime || "application/octet-stream" }), { contentType: a.mime || undefined });
            if (up.error) throw new Error(up.error.message);
            a.storage_path = path;
          }
        };
        const resumenAdjuntos = () => adjuntos.filter((a) => a.storage_path).map((a) => ({ nombre: a.nombre, mime: a.mime, tipo: a.tipo, storage_path: a.storage_path, datos: a.datos ?? {}, ...(a.error ? { error: a.error } : {}) }));

        const textoCompleto = `De: ${remitente}\nAsunto: ${asunto}\nRecibido: ${new Date().toISOString()}\n\n${cuerpo}`;

        // BL existente → solo guardar el correo como documento de referencia.
        if (datos.bl_awb && !pendiente) {
          const { data: existente } = await db.from("expedientes").select("id,numero").ilike("bl_awb", datos.bl_awb).is("eliminado_en", null).limit(1).maybeSingle();
          if (existente) {
            const path = `${existente.id}/${Date.now()}_correo_solicitud.txt`;
            const up = await db.storage.from("documentos").upload(path, new Blob([textoCompleto], { type: "text/plain;charset=utf-8" }));
            if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
            const { error } = await db.from("documentos").insert({
              expediente_id: existente.id, tipo: "Otro", storage_path: path, estado: "recibido",
              fecha_recepcion: new Date().toISOString().slice(0, 10),
              observaciones: `Correo de solicitud recibido${asunto ? `: ${asunto}` : ""}`.slice(0, 500),
            });
            if (error) return Response.json({ error: error.message }, { status: 500 });
            try { await subirAdjuntos(existente.id); } catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
            const filas = resumenAdjuntos().map((a) => ({
              expediente_id: existente.id, tipo: a.tipo, storage_path: a.storage_path, estado: "recibido",
              fecha_recepcion: new Date().toISOString().slice(0, 10),
              observaciones: `Adjunto de correo: ${a.nombre}`.slice(0, 500),
            }));
            if (filas.length) {
              const { error: e2 } = await db.from("documentos").insert(filas);
              if (e2) return Response.json({ error: e2.message }, { status: 500 });
            }
            return Response.json({ resultado: "adjuntado", expediente: existente.numero, adjuntos: filas.map((f) => f.tipo) });
          }
        }

        let clienteId: string | null = null;
        if (datos.cliente_nombre) {
          const nombreCliente = datos.cliente_nombre.split(",")[0].replace(/[%_]/g, "").trim();
          const { data: c } = await db.from("clientes").select("id").ilike("nombre", `%${nombreCliente}%`).limit(2);
          if (c?.length === 1) clienteId = c[0].id;
        }

        try { await subirAdjuntos(`correo/${crypto.randomUUID()}`); } catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
        const listaAdjuntos = resumenAdjuntos();
        // Revalidación atómica: dos entregas simultáneas solo pueden crear una fila.
        const { data: guardado, error } = await db.rpc("guardar_solicitud_correo_pendiente", { p_solicitud: {
          remitente, remitente_correo: remitenteCorreo, asunto, cuerpo, mensaje_aislado: mensaje,
          destinatarios: p.data.destinatarios || null, cc: p.data.cc || null, id_hilo: p.data.id_hilo || null,
          ...datos, advertencias, cliente_id: clienteId, adjuntos: listaAdjuntos,
        } });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!guardado?.id) return Response.json({ error: "No se pudo guardar el borrador" }, { status: 500 });
        if (guardado.actualizado) return respuestaCorreoActualizado(guardado.id);
        const id = guardado.id;
        return Response.json({ resultado: "borrador", id, datos, advertencias, adjuntos: listaAdjuntos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })) });
      },
    },
  },
});
