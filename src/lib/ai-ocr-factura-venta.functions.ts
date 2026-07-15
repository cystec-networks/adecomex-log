import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
});

export type FacturaVentaExtraction = {
  encf: string | null;
  tipo_comprobante: string | null;
  fecha_emision: string | null;
  fecha_vencimiento_ncf: string | null;
  codigo_seguridad: string | null;
  fecha_firma: string | null;
  cliente_razon_social: string | null;
  cliente_rnc: string | null;
  subtotal_gravado: number | null;
  subtotal_exento: number | null;
  total_itbis: number | null;
  otros_impuestos: number | null;
  propina_legal: number | null;
  monto_total: number | null;
};

const PREFIX_MAP: Record<string, string> = {
  E31: "31", E32: "32", E33: "33", E34: "34",
  E41: "41", E43: "43", E44: "44", E45: "45",
};

export const extractFacturaVentaFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<FacturaVentaExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente contable dominicano experto en facturas de VENTA con e-NCF que " +
      "emite la empresa ADECOMEX a sus clientes. Analiza la factura adjunta y devuelve " +
      "ÚNICAMENTE un objeto JSON con las claves exactas: encf, tipo_comprobante, fecha_emision, " +
      "fecha_vencimiento_ncf, codigo_seguridad, fecha_firma, cliente_razon_social, cliente_rnc, " +
      "subtotal_gravado, subtotal_exento, total_itbis, otros_impuestos, propina_legal, monto_total.\n" +
      "Reglas:\n" +
      "- Reconoce si es un BORRADOR interno (sin QR ni código de seguridad) o un e-CF OFICIAL ya " +
      "generado por el facturador de la DGII (trae QR, Código de Seguridad y Fecha de Firma Digital).\n" +
      "- En borradores: CALCULA subtotal_gravado sumando las líneas con impuesto 'ITBIS', y " +
      "subtotal_exento sumando las líneas 'Exempt'/'Exento'.\n" +
      "- En e-CF oficial: LEE DIRECTAMENTE los campos 'Subtotal Gravado', 'Subtotal Exento', " +
      "'Total ITBIS', etc. tal como aparecen etiquetados; no los recalcules.\n" +
      "- Trata los guiones '-' o campos vacíos en tablas de totales como 0.\n" +
      "- encf: e-NCF completo en mayúsculas (ej. 'E310000000173'), o null.\n" +
      "- tipo_comprobante: dos dígitos según prefijo del e-NCF (E31→'31', E32→'32', E33→'33', " +
      "E34→'34', E41→'41', E43→'43', E44→'44', E45→'45'), o null.\n" +
      "- fecha_emision: YYYY-MM-DD. Interpreta DD/MM/AAAA o DD-MM-AAAA como es común en RD.\n" +
      "- fecha_vencimiento_ncf: YYYY-MM-DD. SOLO tómala del campo 'Fecha Vencimiento' que aparece " +
      "junto al e-NCF en la parte SUPERIOR del documento. NUNCA la confundas con una fecha de " +
      "vencimiento de pago al cliente que pueda aparecer en otra parte de la factura.\n" +
      "- codigo_seguridad: valor del campo 'Código de Seguridad', o null.\n" +
      "- fecha_firma: 'YYYY-MM-DD HH:MM:SS' del campo 'Fecha de Firma Digital', o null.\n" +
      "- cliente_razon_social / cliente_rnc: SIEMPRE del cliente facturado, NUNCA de ADECOMEX.\n" +
      "- cliente_rnc: solo dígitos, sin guiones ni espacios.\n" +
      "- Montos: números sin símbolo de moneda ni separadores de miles.\n" +
      "No inventes datos. Usa null cuando el dato no aparezca claramente.";

    const isPdf = data.mime === "application/pdf";
    const raw = await callGateway({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae los datos de esta factura de venta con e-NCF." },
            isPdf
              ? { type: "file", file: { filename: data.filename, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Partial<FacturaVentaExtraction> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "" || v === "-") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const numOrZero = (v: unknown): number | null => {
      if (v === "-" || v === "" || v === null || v === undefined) return 0;
      return num(v);
    };
    const str = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };

    const encf = str(parsed.encf)?.toUpperCase().replace(/\s+/g, "") ?? null;
    let tipo = str(parsed.tipo_comprobante);
    if (!tipo && encf) {
      const prefix = encf.slice(0, 3);
      tipo = PREFIX_MAP[prefix] ?? null;
    }

    const rnc = str(parsed.cliente_rnc)?.replace(/\D/g, "") ?? null;

    return {
      encf,
      tipo_comprobante: tipo,
      fecha_emision: str(parsed.fecha_emision),
      fecha_vencimiento_ncf: str(parsed.fecha_vencimiento_ncf),
      codigo_seguridad: str(parsed.codigo_seguridad),
      fecha_firma: str(parsed.fecha_firma),
      cliente_razon_social: str(parsed.cliente_razon_social),
      cliente_rnc: rnc,
      subtotal_gravado: numOrZero(parsed.subtotal_gravado),
      subtotal_exento: numOrZero(parsed.subtotal_exento),
      total_itbis: numOrZero(parsed.total_itbis),
      otros_impuestos: numOrZero(parsed.otros_impuestos),
      propina_legal: numOrZero(parsed.propina_legal),
      monto_total: num(parsed.monto_total),
    };
  });
