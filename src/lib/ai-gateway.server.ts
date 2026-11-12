// Server-only helper for Lovable AI Gateway (OpenAI-compatible chat completions).
// Every call is registered (función, modelo, tokens, costo), honours the daily cap and reuses
// results by fingerprint of the full request: same model + instructions + content (file bytes
// included) returns the stored answer without calling the model again.
import type { FuncionIa } from "./ia-consumo";
import { modeloCatalogo } from "./ia-consumo";
import { guardarCacheIa, leerCacheIa, marcarCreditosAgotados, registrarConsumoIa, sha256Hex, verificarTopeIa } from "./ia-consumo.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file"; file: { filename: string; file_data: string } }
    >;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };

export class ErrorGateway extends Error {
  /** Créditos agotados o uso de IA bloqueado en el espacio de trabajo: los correos quedan en cola. */
  creditosAgotados = false;
  constructor(mensaje: string, public status: number) { super(mensaje); }
}

export async function callGateway(params: {
  funcion: FuncionIa;
  model: string;
  messages: ChatMessage[];
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: object };
  temperature?: number;
  reasoning_effort?: "low" | "medium" | "high";
  /** false para respuestas que no deben reutilizarse. */
  reutilizar?: boolean;
  /** La lectura usó el texto digital del PDF en lugar de la imagen. */
  viaTexto?: boolean;
}): Promise<string> {
  const { funcion, reutilizar = true, viaTexto = false, ...cuerpo } = params;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const body = JSON.stringify(cuerpo);
  // El nombre del archivo no forma parte de la huella: el mismo contenido con otro nombre se reutiliza.
  const clave = reutilizar ? await sha256Hex(`${funcion}\n${JSON.stringify(cuerpo, (k, v) => (k === "filename" ? undefined : v))}`) : null;
  if (clave) {
    const previo = await leerCacheIa(clave);
    if (previo) {
      await registrarConsumoIa({ funcion, modelo: previo.modelo, reutilizado: true, viaTexto });
      return previo.resultado;
    }
  }
  await verificarTopeIa(funcion);

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new ErrorGateway("Límite de solicitudes alcanzado. Intenta más tarde.", 429);
    if (res.status === 402 || (res.status === 403 && /credit|limit|disabled|top_up|admin_action/i.test(txt))) {
      const mensaje = res.status === 402 ? "Créditos de IA agotados. Añade créditos al workspace." : "El uso de IA del espacio de trabajo está limitado o desactivado.";
      await marcarCreditosAgotados(mensaje);
      const err = new ErrorGateway(mensaje, res.status);
      err.creditosAgotados = true;
      throw err;
    }
    throw new ErrorGateway(`AI Gateway error [${res.status}]: ${txt}`, res.status);
  }

  const data = (await res.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };
  const contenido = data.choices?.[0]?.message?.content ?? "";
  const modelo = modeloCatalogo(data.model, cuerpo.model);
  await registrarConsumoIa({ funcion, modelo, tokensEntrada: data.usage?.prompt_tokens, tokensSalida: data.usage?.completion_tokens, viaTexto });
  if (clave && contenido.trim()) await guardarCacheIa(clave, funcion, modelo, contenido);
  return contenido;
}
