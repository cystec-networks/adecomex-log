import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "listar_expedientes",
  title: "Listar expedientes",
  description:
    "Lista expedientes de importación/exportación de ADECOMEX, con filtro opcional por estado o texto (número, BL/AWB, DUA, mercancía).",
  inputSchema: {
    estado: z.string().optional().describe("Estado exacto del expediente, ej. en_transito, facturado."),
    buscar: z.string().optional().describe("Texto libre: número de expediente, BL/AWB, DUA o mercancía."),
    limite: z.number().int().optional().describe("Máximo de filas a devolver (por defecto 20, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estado, buscar, limite }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const limit = Math.min(Math.max(limite ?? 20, 1), 100);

    let q = supabaseForUser(ctx)
      .from("expedientes")
      .select(
        "id,numero,estado,etapa_actual,bl_awb,numero_dua,descripcion_mercancia,puerto_arribo,medio_transporte,fecha_compromiso,created_at,clientes(nombre)",
      )
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (estado) q = q.eq("estado", estado as never);
    if (buscar) {
      const t = buscar.replace(/[%,]/g, " ").trim();
      q = q.or(
        `numero.ilike.%${t}%,bl_awb.ilike.%${t}%,numero_dua.ilike.%${t}%,descripcion_mercancia.ilike.%${t}%`,
      );
    }

    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult({ total: data?.length ?? 0, expedientes: data ?? [] });
  },
});
