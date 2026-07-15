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
      "- rnc_cedula_proveedor: solo dígitos (sin guiones ni espacios), o null. NUNCA confundas " +
      "el RNC del proveedor con el RNC de ADECOMEX (130481301): si aparece 130481301 en el " +
      "documento es porque ADECOMEX es el CLIENTE de esa factura (el que recibe el bien/servicio), " +
      "nunca el proveedor. El rnc_cedula_proveedor debe ser el RNC de la empresa que EMITE la " +
      "factura (el que aparece en el encabezado/logo del documento), jamás 130481301.\n" +
      "- tipo_id_proveedor: 'RNC' si el identificador tiene 9 dígitos, 'CEDULA' si tiene 11 " +
      "dígitos con formato de cédula dominicana, o null si no se puede determinar.\n" +
      "- ncf_proveedor: código NCF/e-NCF en mayúsculas, o null. Los NCF válidos son de 11 " +
      "posiciones cuando empiezan con 'B' o de 13 posiciones cuando empiezan con 'E'. Si el " +
      "valor extraído tiene más de 13 caracteres y está compuesto por ceros de relleno seguidos " +
      "de una letra + dígitos (por ejemplo '00000000B0100009352'), devuelve SOLO la parte " +
      "significativa a partir de la primera letra (en el ejemplo: 'B0100009352').\n" +
      "- ncf_modificado: solo si es nota de crédito/débito que referencia otro NCF, si no, null. " +
      "Aplica la misma limpieza de ceros de relleno.\n" +
      "- fecha: formato YYYY-MM-DD o null.\n" +
      "- monto_facturado_bienes / monto_facturado_servicios: números (sin símbolo de moneda). " +
      "Si la factura NO distingue bienes de servicios, pon el total en monto_facturado_servicios " +
      "y 0 en monto_facturado_bienes.\n" +
      "- itbis_facturado: número o 0. Muchas facturas de transportistas y otros servicios " +
      "exentos NO tienen ITBIS; si no ves ningún ITBIS o impuesto en la factura, devuelve 0, " +
      "NO null.\n" +
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

    let rnc = str(parsed.rnc_cedula_proveedor)?.replace(/\D/g, "") ?? null;
    // Nunca devolver el RNC de ADECOMEX como proveedor
    if (rnc === "130481301") rnc = null;
    let tipoId = parsed.tipo_id_proveedor ?? null;
    if (tipoId !== "RNC" && tipoId !== "CEDULA") {
      tipoId = rnc && rnc.length === 9 ? "RNC" : rnc && rnc.length === 11 ? "CEDULA" : null;
    }

    // Limpia ceros de relleno en NCF: si tiene >13 chars y hay una letra B/E interior,
    // conserva desde esa letra en adelante.
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
      rnc_cedula_proveedor: rnc,
      tipo_id_proveedor: tipoId,
      ncf_proveedor: cleanNcf(parsed.ncf_proveedor),
      ncf_modificado: cleanNcf(parsed.ncf_modificado),
      fecha: str(parsed.fecha),
      monto_facturado_bienes: num(parsed.monto_facturado_bienes),
      monto_facturado_servicios: num(parsed.monto_facturado_servicios),
      itbis_facturado: num(parsed.itbis_facturado) ?? 0,
      concepto: str(parsed.concepto)?.slice(0, 150) ?? null,
    };
  });
