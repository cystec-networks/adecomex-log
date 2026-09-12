import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
});

export type OcrContenedor = { numero: string; sello1: string | null; sello2: string | null; tipo: string | null };

export type OcrExtraction = {
  cliente: string | null;
  bl: string | null;
  suplidor: string | null;
  numero_documento: string | null;
  productos: string | null;
  fecha_cargado: string | null;
  eta: string | null;
  naviera: string | null;
  peso_bruto_kg: number | null;
  puerto_arribo: string | null;
  contenedores: OcrContenedor[] | null;
  medio_transporte: "maritimo" | "aereo" | null;
  puerto_salida: string | null;
  pais_origen: string | null;
  pais_procedencia: string | null;
  incoterm: string | null;
  factura_comercial: string | null;
  descripcion_mercancia: string | null;
  peso_neto_kg: number | null;
};

export const extractSolicitudFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<OcrExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente de operaciones aduanales en República Dominicana. " +
      "Extraes datos de documentos de importación (BL, factura comercial, packing list, AWB). " +
      "Devuelve ÚNICAMENTE un objeto JSON con las claves exactas: cliente, bl, suplidor, numero_documento, productos, fecha_cargado, eta, naviera, peso_bruto_kg, puerto_arribo, contenedores, medio_transporte, puerto_salida, pais_origen, pais_procedencia, incoterm, factura_comercial, descripcion_mercancia, peso_neto_kg. " +
      "'contenedores' es un arreglo de objetos {numero, sello1, sello2, tipo} — busca una tabla tipo 'FURGONES' o 'CONTENEDORES' con columnas de número de contenedor/furgón, sello(s) y tipo de empaque/contenedor; si no hay tabla de contenedores en el documento, usa null. " +
      "'fecha_cargado' es la fecha de embarque/carga que normalmente aparece en el BL (Shipped on Board / Fecha de Embarque). 'eta' es la fecha ESTIMADA DE LLEGADA — úsala solo si el documento la indica explícitamente como tal (poco común en un BL); si no aparece claramente etiquetada como fecha de llegada, usa null en vez de adivinar con la fecha de embarque. " +
      "'naviera' es el nombre de la naviera/carrier (p. ej. MAERSK, MSC, CMA CGM). 'peso_bruto_kg' es el peso bruto total de la carga en kilogramos (número, sin unidades). " +
      "Agrega estas claves: medio_transporte ('maritimo' si el documento es un Bill of Lading/BL, 'aereo' si es un Airway Bill/AWB — infiérelo del tipo de documento, no necesitas que lo diga explícitamente el texto); " +
      "puerto_salida (el 'Port of Loading' indicado en el BL); pais_origen y pais_procedencia (del país del exportador/embarque); " +
      "incoterm (el término de compra FOB, CIF, EXW, etc. si aparece en la factura — usa null si no aparece explícito, no lo adivines); " +
      "factura_comercial (el número de factura comercial); descripcion_mercancia (un resumen breve de las líneas de producto de la factura); " +
      "peso_neto_kg (el peso neto si aparece junto al peso bruto en el BL — usa null si no aparece). " +
      "Para todos estos: si el dato no aparece claramente en el documento, usa null en vez de inventar o asumir un valor. " +
      "Usa null cuando el dato no aparezca. Las fechas en formato YYYY-MM-DD si es posible. 'productos' como resumen breve (máx 300 caracteres).";


    const isPdf = data.mime === "application/pdf";
    const raw = await callGateway({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae los campos del documento adjunto." },
            isPdf
              ? { type: "file", file: { filename: data.filename, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Partial<OcrExtraction> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    return {
      cliente: parsed.cliente ?? null,
      bl: parsed.bl ?? null,
      suplidor: parsed.suplidor ?? null,
      numero_documento: parsed.numero_documento ?? null,
      productos: parsed.productos ?? null,
      fecha_cargado: parsed.fecha_cargado ?? null,
      eta: parsed.eta ?? null,
      naviera: parsed.naviera ?? null,
      peso_bruto_kg:
        parsed.peso_bruto_kg != null && !isNaN(Number(parsed.peso_bruto_kg)) ? Number(parsed.peso_bruto_kg) : null,
      puerto_arribo: parsed.puerto_arribo ?? null,
      contenedores: Array.isArray(parsed.contenedores)
        ? parsed.contenedores
            .filter((c: any) => c && typeof c.numero === "string" && c.numero.trim())
            .map((c: any) => ({
              numero: String(c.numero).trim(),
              sello1: c.sello1 ? String(c.sello1).trim() : null,
              sello2: c.sello2 ? String(c.sello2).trim() : null,
              tipo: c.tipo ? String(c.tipo).trim() : null,
            }))
        : null,
      medio_transporte:
        parsed.medio_transporte === "maritimo" || parsed.medio_transporte === "aereo" ? parsed.medio_transporte : null,
      puerto_salida: parsed.puerto_salida ?? null,
      pais_origen: parsed.pais_origen ?? null,
      pais_procedencia: parsed.pais_procedencia ?? null,
      incoterm: parsed.incoterm ?? null,
      factura_comercial: parsed.factura_comercial ?? null,
      descripcion_mercancia: parsed.descripcion_mercancia ?? null,
      peso_neto_kg:
        parsed.peso_neto_kg != null && !isNaN(Number(parsed.peso_neto_kg)) ? Number(parsed.peso_neto_kg) : null,
    };
  });
