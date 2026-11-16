// Lectura del PDF «Seguimiento SIGA»: reglas fijas (celdas por posición, luego renglones); solo si fallan, el modelo económico.
import { callGateway } from "./ai-gateway.server";
import { MODELO_ECONOMICO, type FuncionIa } from "./ia-consumo";
import { textoEItemsPdf } from "./pdf-texto.server";
import { esSeguimientoSiga, leerSeguimientoSiga, leerSeguimientoSigaCeldas, normalizarSeguimientoSiga, PROMPT_SEGUIMIENTO_SIGA, type SeguimientoSiga } from "./seguimiento-siga";

const bytesABase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** motivo: por qué no hay datos (se muestra bajo el documento junto a «Leer ahora»). */
export type ResultadoLecturaSiga = { datos: SeguimientoSiga | null; metodo: "texto" | "ia"; motivo?: string | null };

export async function leerSeguimientoSigaPdf(bytes: Uint8Array, filename: string, funcion: FuncionIa = "seguimiento_siga"): Promise<ResultadoLecturaSiga> {
  let pdf: Awaited<ReturnType<typeof textoEItemsPdf>> = null;
  try { pdf = await textoEItemsPdf(bytes); } catch { pdf = null; }
  const texto = pdf?.texto ?? null;
  // 1) Tabla por celdas (formato real del portal SIGA, columnas mezcladas en el texto plano); 2) renglones; 3) IA.
  const porReglas = pdf ? leerSeguimientoSigaCeldas(pdf.items, pdf.texto) ?? leerSeguimientoSiga(pdf.texto) : null;
  if (porReglas) return { datos: porReglas, metodo: "texto" };
  const contenido = texto
    ? `Texto del PDF renglón por renglón (" | " separa columnas):\n${texto}`
    : [{ type: "text" as const, text: "Extrae los campos del reporte adjunto." }, { type: "file" as const, file: { filename, file_data: `data:application/pdf;base64,${bytesABase64(bytes)}` } }];
  let raw: string;
  try {
    raw = await callGateway({
      funcion, model: MODELO_ECONOMICO, temperature: 0, viaTexto: !!texto, response_format: { type: "json_object" },
      messages: [{ role: "system", content: PROMPT_SEGUIMIENTO_SIGA }, { role: "user", content: contenido }],
    });
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    return { datos: null, metodo: "ia", motivo: texto ? `No se encontró el BL en el reporte y la lectura de respaldo no está disponible (${causa.slice(0, 120)}).` : `No se pudo leer el PDF (${causa.slice(0, 120)}).` };
  }
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { j = {}; }
  const datos = normalizarSeguimientoSiga(j.seguimiento_siga ?? j);
  if (datos.bl_hijo || datos.bl_madre) return { datos, metodo: "ia" };
  const motivo = !texto ? "No se pudo leer el PDF: no tiene texto legible."
    : !esSeguimientoSiga(texto) ? "El PDF no parece un Seguimiento SIGA (Estado de Desaduanización)."
    : "No se encontró el BL (Doc.Embarque) en el reporte.";
  return { datos: null, metodo: "ia", motivo };
}
