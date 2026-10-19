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

const SYSTEM_CLASIFICADOR =
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

const MODELO = "google/gemini-2.5-flash";

export const classifyArancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_CLASIFICADOR },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const reply = await callGateway({ model: MODELO, messages });
    return { reply };
  });

const LoteInput = z.object({ descripciones: z.array(z.string().max(1000)).min(1).max(100) });

/** Mismo motor (modelo + criterio) que el chat, pero devolviendo solo la partida principal por línea. */
export const classifyArancelLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LoteInput.parse(data))
  .handler(async ({ data }): Promise<{ partidas: (string | null)[] }> => {
    const lista = data.descripciones.map((d, i) => `${i + 1}. ${d}`).join("\n");
    const raw = await callGateway({
      model: MODELO,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            SYSTEM_CLASIFICADOR +
            "\n\nMODO LOTE: recibirás varias descripciones numeradas. Para cada una aplica el mismo criterio y devuelve ÚNICAMENTE " +
            "un objeto JSON {\"partidas\":[string|null,...]} con la partida más probable a 10 dígitos (NNNN.NN.NN.NN) en el mismo orden; " +
            "usa null si la descripción no permite clasificar.",
        },
        { role: "user", content: lista },
      ],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
    const arr: unknown[] = Array.isArray(parsed?.partidas) ? parsed.partidas : [];
    return {
      partidas: data.descripciones.map((_, i) => {
        const d = String(arr[i] ?? "").replace(/[^0-9]/g, "");
        return d.length === 10 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8, 10)}` : null;
      }),
    };
  });
