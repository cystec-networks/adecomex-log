import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { filaArancelSchema } from "./catalogo-arancelario";

export const importarArancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filas: z.array(filaArancelSchema).min(1).max(20000) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (roleError || !roles?.length) throw new Error("Solo Administrador puede importar el catálogo arancelario.");
    const { data: cantidad, error } = await context.supabase.rpc("importar_catalogo_arancelario", { _filas: data.filas });
    if (error) { console.error("Importación arancelaria rechazada", error.code); throw new Error("No se importó el archivo. Revisa sus datos y vuelve a intentarlo."); }
    return { cantidad: cantidad ?? 0 };
  });