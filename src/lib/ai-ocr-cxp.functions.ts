import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
});

export type CuentaPorPagarExtraction = {
  proveedor_nombre: string | null;
  proveedor_rnc: string | null;
  numero_factura: string | null;
  ncf_proveedor: string | null;
  fecha_factura: string | null;
  monto_total: number | null;
};

export const extractCuentaPorPagarFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<CuentaPorPagarExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente contable dominicano experto en facturas de proveedores y " +
      "transportistas. Analiza la factura adjunta y devuelve ÚNICAMENTE un objeto JSON con " +
      "las claves exactas: proveedor_nombre, proveedor_rnc, numero_factura, ncf_proveedor, " +
      "fecha_factura, monto_total.\n" +
      "Reglas:\n" +
      "- proveedor_nombre: el nombre de la empresa que EMITE la factura (el que aparece en el " +
      "encabezado/logo del documento), NUNCA ADECOMEX.\n" +
      "- proveedor_rnc: solo dígitos (sin guiones ni espacios), o null. NUNCA confundas el RNC " +
      "del proveedor con el RNC de ADECOMEX (130481301): si aparece 130481301 en el documento " +
      "es porque ADECOMEX es el CLIENTE/receptor de esa factura, nunca el proveedor.\n" +
      "- numero_factura: el número de factura del proveedor (por ejemplo '1474'), o null.\n" +
      "- ncf_proveedor: código NCF/e-NCF en mayúsculas, o null. Los NCF válidos son de 11 " +
      "posiciones cuando empiezan con 'B' o de 13 posiciones cuando empiezan con 'E'. Si el " +
      "valor extraído tiene más de 13 caracteres y está compuesto por ceros de relleno seguidos " +
      "de una letra + dígitos (por ejemplo '00000000B0100009352'), devuelve SOLO la parte " +
      "significativa a partir de la primera letra (en el ejemplo: 'B0100009352').\n" +
      "- fecha_factura: formato YYYY-MM-DD. En República Dominicana las fechas se escriben " +
      "DD/MM/AA o DD/MM/AAAA; interprétalas así al convertir.\n" +
      "- monto_total: número (sin símbolo de moneda) con el total / neto a pagar de la factura.\n" +
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
            { type: "text", text: "Extrae los datos de la factura adjunta." },
            isPdf
              ? { type: "file", file: { filename: data.filename, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Partial<CuentaPorPagarExtraction> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };

    let rnc = str(parsed.proveedor_rnc)?.replace(/\D/g, "") ?? null;
    if (rnc === "130481301") rnc = null;

    const cleanNcf = (v: unknown): string | null => {
      const s = str(v)?.toUpperCase() ?? null;
      if (!s) return null;
      if (s.length > 13) {
        const m = s.match(/[BE][A-Z0-9]+$/);
        if (m) return m[0];
      }
      return s;
    };

    return {
      proveedor_nombre: str(parsed.proveedor_nombre),
      proveedor_rnc: rnc,
      numero_factura: str(parsed.numero_factura),
      ncf_proveedor: cleanNcf(parsed.ncf_proveedor),
      fecha_factura: str(parsed.fecha_factura),
      monto_total: num(parsed.monto_total),
    };
  });
