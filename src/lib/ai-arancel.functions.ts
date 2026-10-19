import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { clasificarConCatalogo } from "./copiloto-clasificador.server";
import { NO_DETERMINADA } from "./copiloto-candidatos";

const Input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1)
    .max(30),
});

export const classifyArancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<{ reply: string }> => {
    const descripcion = data.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const [r] = await clasificarConCatalogo(context.supabase, context.userId, [descripcion]);
    const reply = r?.arancel
      ? `**${r.arancel.codigo}** — ${r.arancel.descripcion}\n\n${r.explicacion}\n\nClasificación referencial — validación final por la DGA.`
      : r?.producto === false ? "Sin sugerencia" : NO_DETERMINADA;
    return { reply };
  });

const LoteInput = z.object({ descripciones: z.array(z.string().max(1000)).min(1).max(100) });

export const classifyArancelLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LoteInput.parse(data))
  .handler(async ({ data, context }) => {
    const resultados = await clasificarConCatalogo(context.supabase, context.userId, data.descripciones);
    return { partidas: resultados.map((r) => r.arancel?.codigo ?? null), resultados };
  });
