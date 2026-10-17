import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { filaArancelSchema } from "./catalogo-arancelario";

const LOTE = 500;

export const importarArancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filas: z.array(filaArancelSchema).min(1).max(20000) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (roleError || !roles?.length) throw new Error("Solo Administrador puede importar el catálogo arancelario.");
    let insertadas = 0;
    let actualizadas = 0;
    for (let i = 0; i < data.filas.length; i += LOTE) {
      const lote = data.filas.slice(i, i + LOTE);
      const { data: conteo, error } = await context.supabase.rpc("importar_catalogo_arancelario", { _filas: lote });
      if (error) { console.error("Importación arancelaria rechazada", error.code); throw new Error(`No se importó el lote ${Math.floor(i / LOTE) + 1}. Revisa sus datos y vuelve a intentarlo.`); }
      insertadas += Number((conteo as { insertadas?: number } | null)?.insertadas ?? 0);
      actualizadas += Number((conteo as { actualizadas?: number } | null)?.actualizadas ?? 0);
    }
    return { insertadas, actualizadas, total: insertadas + actualizadas };
  });
