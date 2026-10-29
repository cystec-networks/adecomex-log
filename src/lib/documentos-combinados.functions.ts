import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reanuda una tarea atascada (p. ej. si el aviso automático no llegó). Solo personal que puede verla. */
export const reanudarDocumentoCombinado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: visible } = await (context.supabase as any).from("correo_documentos_combinados").select("id").eq("id", data.id).maybeSingle();
    if (!visible) throw new Error("No autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { procesarCola } = await import("@/lib/correo-documento-combinado.server");
    return { procesados: await procesarCola(supabaseAdmin as any, { id: data.id, max: 1 }) };
  });
