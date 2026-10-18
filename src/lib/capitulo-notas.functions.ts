import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { notaCapituloSchema } from "./capitulo-notas";

export const importarNotasCapitulo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ filas: z.array(notaCapituloSchema).min(1).max(96)
    .refine((filas) => new Set(filas.map((f) => f.capitulo)).size === filas.length, "Hay capítulos duplicados") }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (roleError || !roles?.length) throw new Error("Solo Administrador puede importar notas por capítulo.");
    const { data: conteo, error } = await context.supabase.rpc("importar_capitulo_notas", { _filas: data.filas });
    if (error) throw new Error("No se importaron las notas. Revisa los datos y vuelve a intentarlo.");
    const resultado = z.object({ insertadas: z.number(), actualizadas: z.number() }).parse(conteo);
    return resultado;
  });