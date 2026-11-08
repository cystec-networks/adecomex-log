import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const validarId = (input: { documentoId?: string } | undefined) => {
  const id = input?.documentoId ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Documento inválido");
  return { documentoId: id };
};

async function exigirAdmin(context: { supabase: any; userId: string }) {
  const { data: rol } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!rol) throw new Error("Solo un administrador puede procesar la base normativa.");
}

/** Paso 1: extrae el texto del PDF y prepara los fragmentos (también para reprocesar). */
export const extraerDocumentoNormativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarId)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extraerDocumento } = await import("./normativa.server");
    return extraerDocumento(supabaseAdmin, data.documentoId);
  });

/** Paso 2 (repetible hasta terminar): vectoriza el siguiente lote de fragmentos. */
export const vectorizarDocumentoNormativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarId)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vectorizarLote } = await import("./normativa.server");
    return vectorizarLote(supabaseAdmin, data.documentoId);
  });
