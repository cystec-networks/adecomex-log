import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
});

export type OcrExtraction = {
  cliente: string | null;
  bl: string | null;
  suplidor: string | null;
  numero_documento: string | null;
  productos: string | null;
  eta: string | null;
  puerto_arribo: string | null;
};

export const extractSolicitudFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<OcrExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente de operaciones aduanales en República Dominicana. " +
      "Extraes datos de documentos de importación (BL, factura comercial, packing list, AWB). " +
      "Devuelve ÚNICAMENTE un objeto JSON con las claves exactas: cliente, bl, suplidor, numero_documento, productos, eta, puerto_arribo. " +
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
    };
  });
