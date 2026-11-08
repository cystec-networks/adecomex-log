// Vectores de texto con Lovable AI (solo servidor). Lotes acotados, orden por
// `index` y reintento limitado ante límites temporales (429/5xx).
const URL_EMBEDDINGS = "https://ai.gateway.lovable.dev/v1/embeddings";
export const MODELO_EMBEDDINGS = "google/gemini-embedding-2";
export const DIMENSIONES_EMBEDDINGS = 3072;
/** El proveedor acepta como máximo 100 textos por solicitud. */
const MAX_POR_SOLICITUD = 100;

export class ErrorEmbeddings extends Error {
  constructor(
    mensaje: string,
    public status: number,
    /** Créditos agotados o acceso bloqueado: no tiene sentido reintentar. */
    public terminal: boolean,
  ) {
    super(mensaje);
  }
}

async function solicitar(input: string[], intentos = 3): Promise<number[][]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new ErrorEmbeddings("Falta la clave del servicio de IA.", 401, true);
  for (let intento = 1; ; intento++) {
    const res = await fetch(URL_EMBEDDINGS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({ model: MODELO_EMBEDDINGS, input }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ index: number; embedding: number[] }> };
      const ordenados: number[][] = Array.from({ length: input.length });
      for (const item of data.data ?? []) {
        if (Number.isInteger(item.index) && item.index >= 0 && item.index < input.length)
          ordenados[item.index] = item.embedding;
      }
      if (ordenados.some((v) => !Array.isArray(v) || v.length !== DIMENSIONES_EMBEDDINGS))
        throw new ErrorEmbeddings("El servicio de IA devolvió vectores incompletos.", 502, false);
      return ordenados;
    }
    const cuerpo = await res.text();
    if (res.status === 402)
      throw new ErrorEmbeddings(
        "Se agotaron los créditos de IA del espacio de trabajo. Un administrador puede recargarlos en Configuración → Planes y créditos.",
        402,
        true,
      );
    if (res.status === 403)
      throw new ErrorEmbeddings(
        /credit|limit|disabled/i.test(cuerpo)
          ? "El uso de IA del espacio de trabajo está limitado o desactivado."
          : "El servicio de IA rechazó el acceso para esta tarea.",
        403,
        true,
      );
    const reintentable = res.status === 429 || res.status >= 500;
    if (!reintentable || intento >= intentos) {
      console.error("[embeddings] error", res.status, cuerpo.slice(0, 300));
      throw new ErrorEmbeddings(
        res.status === 429
          ? "El servicio de IA está limitando las solicitudes. Inténtalo en unos minutos."
          : `El servicio de IA respondió ${res.status}.`,
        res.status,
        false,
      );
    }
    const espera = Number(res.headers.get("Retry-After"));
    await new Promise((r) => setTimeout(r, (espera > 0 ? espera * 1000 : 1000 * 2 ** intento) + Math.random() * 500));
  }
}

/** Vectoriza textos en lotes de hasta 100, devolviendo los vectores en el mismo orden. */
export async function vectorizar(textos: string[]): Promise<number[][]> {
  const salida: number[][] = [];
  for (let i = 0; i < textos.length; i += MAX_POR_SOLICITUD)
    salida.push(...(await solicitar(textos.slice(i, i + MAX_POR_SOLICITUD))));
  return salida;
}

/** Representación textual que acepta pgvector. */
export const vectorTexto = (v: number[]) => `[${v.join(",")}]`;
