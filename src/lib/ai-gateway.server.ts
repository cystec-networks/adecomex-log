// Server-only helper for Lovable AI Gateway (OpenAI-compatible chat completions).
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file"; file: { filename: string; file_data: string } }
    >;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };

export async function callGateway(params: {
  model: string;
  messages: ChatMessage[];
  response_format?: { type: "json_object" };
  temperature?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Límite de solicitudes alcanzado. Intenta más tarde.");
    if (res.status === 402) throw new Error("Créditos de IA agotados. Añade créditos al workspace.");
    throw new Error(`AI Gateway error [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}
