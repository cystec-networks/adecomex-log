import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "detalle_expediente",
  title: "Detalle de expediente",
  description:
    "Devuelve el detalle completo de un expediente por su número (ej. EXP-2026-001), incluyendo cliente, fechas de estado y datos aduanales.",
  inputSchema: {
    numero: z.string().describe("Número del expediente."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ numero }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;

    const { data, error } = await supabaseForUser(ctx)
      .from("expedientes")
      .select("*, clientes(nombre,rnc,email,telefono)")
      .eq("numero", numero.trim())
      .is("eliminado_en", null)
      .maybeSingle();

    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No se encontró el expediente ${numero}.`);
    return textResult(data);
  },
});
