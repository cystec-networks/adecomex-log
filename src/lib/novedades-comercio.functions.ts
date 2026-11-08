import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Revisión manual (todas las fuentes activas o una sola) iniciada por un administrador. */
export const revisarNovedadesAhora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fuenteId?: string | null } | undefined) => {
    const id = input?.fuenteId ?? null;
    if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Fuente inválida");
    return { fuenteId: id };
  })
  .handler(async ({ data, context }) => {
    const { data: rol } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!rol) throw new Error("Solo un administrador puede revisar las fuentes.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { revisarNovedades } = await import("./novedades-comercio.server");
    return revisarNovedades(supabaseAdmin, {
      modo: "manual",
      fuenteId: data.fuenteId ?? undefined,
    });
  });
