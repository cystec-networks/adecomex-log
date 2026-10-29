import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";
import type { LineaFacturaExpediente } from "./factura-expediente-arancel";
import type { PagoPuerto } from "./pago-puerto";
import { TIPOS_RESULTADO_DGA, type ResultadoDgaExtraido } from "./resultado-dga-documentos";
import type { CertificadoDga } from "./certificado-origen-dga";
import type { LiquidacionDga } from "./liquidacion-dga-documento";
import type { CartaRuta } from "./carta-ruta";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
  lineas_factura: z.boolean().optional(),
  pago_puerto: z.boolean().optional(),
  resultado_dga: z.enum(TIPOS_RESULTADO_DGA).optional(),
  certificado_origen_dga: z.boolean().optional(),
  carta_ruta: z.boolean().optional(),
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
  buque: string | null;
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
  fob_total: number | null;
  total_factura?: number | null;
  moneda_factura?: 'USD' | 'DOP' | 'EUR' | null;
  seguro: number | null;
  flete: number | null;
  otros_gastos: number | null;
  notify_party: string | null;
  agente_entrega: string | null;
  tipo_carga: string | null;
  tipo_carga_confianza: "alta" | "media" | null;
  lineas_factura?: LineaFacturaExpediente[];
  productos_factura?: Awaited<ReturnType<typeof import("./factura-expediente-arancel").prepararProductosFactura>>;
  pago_puerto?: PagoPuerto;
  resultado_dga?: ResultadoDgaExtraido & LiquidacionDga;
  certificado_origen_dga?: CertificadoDga;
  carta_ruta?: CartaRuta;
};

export const extractSolicitudFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<OcrExtraction> => {
    const { leerDocumentoImportacion } = await import("./ai-ocr.server");
    return leerDocumentoImportacion(data);
  });

export type OcrLineaFactura = { descripcion: string; cantidad: number | null; unidad: string | null };

/** Mismo extractor OCR (modelo y canal), devolviendo las líneas de producto de la factura. */
export const extractLineasFactura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ lineas: OcrLineaFactura[] }> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;
    const isPdf = data.mime === "application/pdf";
    const raw = await callGateway({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de operaciones aduanales en República Dominicana. Extraes las líneas de producto de facturas comerciales. " +
            "Devuelve ÚNICAMENTE un objeto JSON {\"lineas\":[{\"descripcion\":string,\"cantidad\":number|null,\"unidad\":string|null}]}, una entrada por cada línea de producto, en el orden del documento. " +
            "'descripcion' tal como aparece en la factura (sin traducir). Si una línea es ilegible deja descripcion vacía pero inclúyela. No inventes datos.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae las líneas de producto de esta factura." },
            isPdf
              ? { type: "file", file: { filename: data.filename, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
    const arr = Array.isArray(parsed?.lineas) ? parsed.lineas : [];
    return {
      lineas: arr.slice(0, 200).map((l: any) => ({
        descripcion: String(l?.descripcion ?? "").trim(),
        cantidad: l?.cantidad != null && l.cantidad !== "" && !isNaN(Number(l.cantidad)) ? Number(l.cantidad) : null,
        unidad: l?.unidad ? String(l.unidad).trim() : null,
      })),
    };
  });
