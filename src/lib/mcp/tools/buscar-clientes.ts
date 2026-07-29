import { defineTool } from "@lovable.dev/mcp-js";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { z } from "zod";
import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "buscar_clientes",
  title: "Buscar clientes",
  description: "Busca clientes de ADECOMEX por nombre o RNC y devuelve sus datos de contacto.",
  inputSchema: {
    buscar: z.string().describe("Nombre o RNC del cliente."),
    limite: z.number().int().optional().describe("Máximo de filas (por defecto 10, máximo 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ buscar, limite }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const limit = Math.min(Math.max(limite ?? 10, 1), 50);
    const t = buscar.replace(/[%,]/g, " ").trim();

    const { data, error } = await supabaseForUser(ctx)
      .from("clientes")
      .select("id,nombre,rnc,contacto,email,telefono,activo")
      .or(`nombre.ilike.%${sanitizeSearchTerm(t)}%,rnc.ilike.%${sanitizeSearchTerm(t)}%`)
      .order("nombre")
      .limit(limit);

    if (error) return errorResult(error.message);
    return textResult({ total: data?.length ?? 0, clientes: data ?? [] });
  },
});
