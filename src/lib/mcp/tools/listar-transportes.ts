import { defineTool } from "@lovable.dev/mcp-js";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { z } from "zod";
import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "listar_transportes",
  title: "Listar transportes",
  description: "Lista viajes de transporte (fletes marítimos, aéreos o terrestres) con filtro opcional por estado o texto.",
  inputSchema: {
    estado: z.string().optional().describe("Estado exacto del transporte."),
    buscar: z.string().optional().describe("Texto libre: número de viaje, transportista o placa/contenedor."),
    limite: z.number().int().optional().describe("Máximo de filas (por defecto 20, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estado, buscar, limite }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const limit = Math.min(Math.max(limite ?? 20, 1), 100);

    let q = supabaseForUser(ctx)
      .from("transportes")
      .select(
        "id,numero_viaje,estado,tipo,transportista,origen,destino,eta,fecha_salida,placa_contenedor,flete_monto,flete_moneda,pago_estado,created_at,clientes(nombre)",
      )
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (estado) q = q.eq("estado", estado as never);
    if (buscar) {
      const t = buscar.replace(/[%,]/g, " ").trim();
      q = q.or(`numero_viaje.ilike.%${sanitizeSearchTerm(t)}%,transportista.ilike.%${sanitizeSearchTerm(t)}%,placa_contenedor.ilike.%${sanitizeSearchTerm(t)}%`);
    }

    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult({ total: data?.length ?? 0, transportes: data ?? [] });
  },
});
