import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aislarMensajeReciente, combinarDatos, extraerPorEtiquetas, fusionarAsunto, fusionarAdjuntos, tipoAdjuntoCorreo, TIPOS_ADJUNTO_CORREO, type DatosAdjunto } from "@/lib/correo-solicitud";
import { PROMPT_DOCUMENTO_IMPORTACION } from "@/lib/ocr-documento-prompt";
import { callGateway } from "@/lib/ai-gateway.server";

const adjuntoSchema = z.object({
  nombre: z.string().trim().min(1).max(300),
  tipo: z.string().trim().max(150),
  contenido: z.string().min(20).max(20_000_000),
});

type AdjuntoProcesado = DatosAdjunto & { nombre: string; mime: string; bytes: Uint8Array; storage_path?: string; error?: string };

const MIME_OK = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;

/** Reutiliza el reconocimiento de Nuevo Expediente y añade la clasificación del tipo de documento. */
async function leerAdjunto(a: z.infer<typeof adjuntoSchema>): Promise<AdjuntoProcesado> {
  const base64 = a.contenido.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  const mime = (a.tipo || (/\.pdf$/i.test(a.nombre) ? "application/pdf" : "")).toLowerCase();
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
    const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      ...base,
      tipo: tipoAdjuntoCorreo(j.tipo_documento),
      bl_awb: txt(j.bl),
      cliente_nombre: txt(j.cliente),
      producto: txt(j.productos) ?? txt(j.descripcion_mercancia),
      cantidad: txt(j.cantidad),
      peso_bruto_kg: j.peso_bruto_kg != null && !isNaN(Number(j.peso_bruto_kg)) ? Number(j.peso_bruto_kg) : null,
      factura_comercial: txt(j.factura_comercial),
    };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

const nombreSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ]+/g, "_").slice(-120);

const schema = z.object({
  remitente: z.string().trim().max(500).optional().default(""),
  asunto: z.string().trim().max(1000).optional().default(""),
  cuerpo: z.string().min(1).max(200_000),
  adjuntos: z.array(adjuntoSchema).max(10).optional().default([]),
});

function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
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
        const secreto = process.env.CORREO_WEBHOOK_SECRET;
        const recibido = request.headers.get("x-webhook-secret") ?? "";
        if (!secreto || !igualSeguro(recibido, secreto)) return Response.json({ error: "No autorizado" }, { status: 401 });

        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
        const p = schema.safeParse(body);
        if (!p.success) return Response.json({ error: "Faltan remitente/asunto/cuerpo válidos" }, { status: 400 });
        const { remitente, asunto, cuerpo, adjuntos: adjuntosIn } = p.data;

        const mensaje = aislarMensajeReciente(cuerpo);
        if (!mensaje) return Response.json({ resultado: "descartado", motivo: "Mensaje vacío" });

        let ia: any;
        try { ia = await clasificar(asunto, remitente, mensaje); }
        catch (e: any) { return Response.json({ error: e.message }, { status: e.status ?? 500 }); }
        if (!ia?.es_solicitud_nueva) return Response.json({ resultado: "descartado", motivo: ia?.motivo ?? "No es una solicitud nueva" });

        const correo = fusionarAsunto(combinarDatos(extraerPorEtiquetas(mensaje), ia, mensaje, remitente), asunto);
        // Un adjunto ilegible no bloquea a los demás: queda como «Otro».
        const adjuntos = await Promise.all(adjuntosIn.map(leerAdjunto));
        const { datos, advertencias } = fusionarAdjuntos(correo.datos, correo.advertencias, adjuntos);
        const remitenteCorreo = correoDe(remitente);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        const subirAdjuntos = async (carpeta: string) => {
          for (const [i, a] of adjuntos.entries()) {
            if (!a.bytes.length) continue;
            const path = `${carpeta}/${Date.now()}_${i}_${nombreSeguro(a.nombre)}`;
            const up = await db.storage.from("documentos").upload(path, new Blob([a.bytes as BlobPart], { type: a.mime || "application/octet-stream" }), { contentType: a.mime || undefined });
            if (up.error) throw new Error(up.error.message);
            a.storage_path = path;
          }
        };
        const resumenAdjuntos = () => adjuntos.filter((a) => a.storage_path).map((a) => ({ nombre: a.nombre, mime: a.mime, tipo: a.tipo, storage_path: a.storage_path, ...(a.error ? { error: a.error } : {}) }));

        const textoCompleto = `De: ${remitente}\nAsunto: ${asunto}\nRecibido: ${new Date().toISOString()}\n\n${cuerpo}`;

        // BL existente → solo guardar el correo como documento de referencia.
        if (datos.bl_awb) {
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
        const { data: fila, error } = await db.from("solicitudes_correo").insert({
          remitente, remitente_correo: remitenteCorreo, asunto, cuerpo, mensaje_aislado: mensaje,
          ...datos, advertencias, cliente_id: clienteId, adjuntos: listaAdjuntos,
        }).select("id").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ resultado: "borrador", id: fila.id, datos, advertencias, adjuntos: listaAdjuntos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })) });
      },
    },
  },
});
