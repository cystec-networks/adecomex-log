import { defineTool } from "@lovable.dev/mcp-js";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { z } from "zod";
import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "listar_solicitudes",
  title: "Listar solicitudes",
  description: "Lista solicitudes de importación/exportación recibidas, con filtro opcional por estado o texto.",
  inputSchema: {
    estado: z.string().optional().describe("Estado exacto de la solicitud."),
    buscar: z.string().optional().describe("Texto libre: número, BL/AWB o factura comercial."),
    limite: z.number().int().optional().describe("Máximo de filas (por defecto 20, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estado, buscar, limite }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const limit = Math.min(Math.max(limite ?? 20, 1), 100);

    let q = supabaseForUser(ctx)
      .from("solicitudes")
      .select(
        "id,numero,estado,prioridad,origen,puerto_llegada,medio_transporte,bl_awb,factura_comercial,fecha_arribo_est,created_at,clientes(nombre)",
      )
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (estado) q = q.eq("estado", estado as never);
    if (buscar) {
      const t = buscar.replace(/[%,]/g, " ").trim();
      q = q.or(`numero.ilike.%${sanitizeSearchTerm(t)}%,bl_awb.ilike.%${sanitizeSearchTerm(t)}%,factura_comercial.ilike.%${sanitizeSearchTerm(t)}%`);
    }

    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult({ total: data?.length ?? 0, solicitudes: data ?? [] });
  },
});
