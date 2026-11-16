// Lectura del PDF «Seguimiento SIGA»: reglas fijas sobre el texto; solo si fallan, el modelo económico.
import { callGateway } from "./ai-gateway.server";
import { MODELO_ECONOMICO, type FuncionIa } from "./ia-consumo";
import { textoPdfRenglones } from "./pdf-texto.server";
import { leerSeguimientoSiga, normalizarSeguimientoSiga, PROMPT_SEGUIMIENTO_SIGA, type SeguimientoSiga } from "./seguimiento-siga";

const bytesABase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export type ResultadoLecturaSiga = { datos: SeguimientoSiga | null; metodo: "texto" | "ia" };

export async function leerSeguimientoSigaPdf(bytes: Uint8Array, filename: string, funcion: FuncionIa = "seguimiento_siga"): Promise<ResultadoLecturaSiga> {
  const texto = await textoPdfRenglones(bytes);
  const porReglas = texto ? leerSeguimientoSiga(texto) : null;
  if (porReglas) return { datos: porReglas, metodo: "texto" };
  const contenido = texto
    ? `Texto del PDF renglón por renglón (" | " separa columnas):\n${texto}`
    : [{ type: "text" as const, text: "Extrae los campos del reporte adjunto." }, { type: "file" as const, file: { filename, file_data: `data:application/pdf;base64,${bytesABase64(bytes)}` } }];
  const raw = await callGateway({
    funcion, model: MODELO_ECONOMICO, temperature: 0, viaTexto: !!texto, response_format: { type: "json_object" },
    messages: [{ role: "system", content: PROMPT_SEGUIMIENTO_SIGA }, { role: "user", content: contenido }],
  });
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { j = {}; }
  const datos = normalizarSeguimientoSiga(j.seguimiento_siga ?? j);
  return { datos: datos.bl_hijo ? datos : null, metodo: "ia" };
}
