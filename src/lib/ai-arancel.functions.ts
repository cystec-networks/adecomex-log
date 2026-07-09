import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway, type ChatMessage } from "./ai-gateway.server";

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
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const system =
      "Eres un copiloto clasificador arancelario experto en el Arancel de Aduanas de la República Dominicana " +
      "(Sistema Armonizado + desdoblamientos nacionales a 10 dígitos, alineado con la DGA). " +
      "Cuando el usuario describe una mercancía:\n" +
      "1) Sugiere la partida más probable a 10 dígitos (formato NNNN.NN.NN.NN).\n" +
      "2) Ofrece 1-3 alternativas si aplica, cada una con su código y descripción.\n" +
      "3) Explica brevemente la Regla General de Interpretación aplicada.\n" +
      "4) Menciona notas de sección/capítulo relevantes y advertencias (permisos, no-arancelarios).\n" +
      "5) Si falta información clave (material, uso, presentación, composición), pide aclaración antes de clasificar.\n" +
      "Responde SIEMPRE en español, formato markdown, breve y accionable. " +
      "Aclara que la clasificación final la valida la DGA y es referencial.";

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const reply = await callGateway({
      model: "google/gemini-2.5-flash",
      messages,
    });

    return { reply };
  });
