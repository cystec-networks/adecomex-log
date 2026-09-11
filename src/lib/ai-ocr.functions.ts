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
  eta: string | null;
  puerto_arribo: string | null;
  contenedores: OcrContenedor[] | null;
};

export const extractSolicitudFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<OcrExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente de operaciones aduanales en República Dominicana. " +
      "Extraes datos de documentos de importación (BL, factura comercial, packing list, AWB). " +
      "Devuelve ÚNICAMENTE un objeto JSON con las claves exactas: cliente, bl, suplidor, numero_documento, productos, eta, puerto_arribo, contenedores. " +
      "'contenedores' es un arreglo de objetos {numero, sello1, sello2, tipo} — busca una tabla tipo 'FURGONES' o 'CONTENEDORES' con columnas de número de contenedor/furgón, sello(s) y tipo de empaque/contenedor; si no hay tabla de contenedores en el documento, usa null. " +
      "Usa null cuando el dato no aparezca. 'eta' en formato YYYY-MM-DD si es posible. 'productos' como resumen breve (máx 300 caracteres).";


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
      eta: parsed.eta ?? null,
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
    };
  });
