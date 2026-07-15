import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({
  filename: z.string(),
  mime: z.string(),
  base64: z.string().min(20),
});

export type GastoFiscalExtraction = {
  proveedor_nombre: string | null;
  rnc_cedula_proveedor: string | null;
  tipo_id_proveedor: "RNC" | "CEDULA" | null;
  ncf_proveedor: string | null;
  ncf_modificado: string | null;
  fecha: string | null;
  monto_facturado_bienes: number | null;
  monto_facturado_servicios: number | null;
  itbis_facturado: number | null;
  concepto: string | null;
};

export const extractGastoFiscalFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<GastoFiscalExtraction> => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;

    const system =
      "Eres un asistente contable dominicano experto en facturas de proveedores con NCF " +
      "para el reporte 606 de la DGII. Analiza la factura adjunta y devuelve ÚNICAMENTE un " +
      "objeto JSON con las claves exactas: proveedor_nombre, rnc_cedula_proveedor, " +
      "tipo_id_proveedor, ncf_proveedor, ncf_modificado, fecha, monto_facturado_bienes, " +
      "monto_facturado_servicios, itbis_facturado, concepto.\n" +
      "Reglas:\n" +
      "- rnc_cedula_proveedor: solo dígitos (sin guiones ni espacios), o null.\n" +
      "- tipo_id_proveedor: 'RNC' si el identificador tiene 9 dígitos, 'CEDULA' si tiene 11 " +
      "dígitos con formato de cédula dominicana, o null si no se puede determinar.\n" +
      "- ncf_proveedor: código NCF/e-NCF en mayúsculas, o null.\n" +
      "- ncf_modificado: solo si es nota de crédito/débito que referencia otro NCF, si no, null.\n" +
      "- fecha: formato YYYY-MM-DD o null.\n" +
      "- monto_facturado_bienes / monto_facturado_servicios: números (sin símbolo de moneda). " +
      "Si la factura NO distingue bienes de servicios, pon el total en monto_facturado_servicios " +
      "y 0 en monto_facturado_bienes.\n" +
      "- itbis_facturado: número o null.\n" +
      "- concepto: resumen breve de lo facturado, máximo 150 caracteres.\n" +
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
            { type: "text", text: "Extrae los datos fiscales de la factura adjunta." },
            isPdf
              ? { type: "file", file: { filename: data.filename, file_data: dataUrl } }
              : { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Partial<GastoFiscalExtraction> = {};
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

    const rnc = str(parsed.rnc_cedula_proveedor)?.replace(/\D/g, "") ?? null;
    let tipoId = parsed.tipo_id_proveedor ?? null;
    if (tipoId !== "RNC" && tipoId !== "CEDULA") {
      tipoId = rnc && rnc.length === 9 ? "RNC" : rnc && rnc.length === 11 ? "CEDULA" : null;
    }

    return {
      proveedor_nombre: str(parsed.proveedor_nombre),
      rnc_cedula_proveedor: rnc,
      tipo_id_proveedor: tipoId,
      ncf_proveedor: str(parsed.ncf_proveedor)?.toUpperCase() ?? null,
      ncf_modificado: str(parsed.ncf_modificado)?.toUpperCase() ?? null,
      fecha: str(parsed.fecha),
      monto_facturado_bienes: num(parsed.monto_facturado_bienes),
      monto_facturado_servicios: num(parsed.monto_facturado_servicios),
      itbis_facturado: num(parsed.itbis_facturado),
      concepto: str(parsed.concepto)?.slice(0, 150) ?? null,
    };
  });
