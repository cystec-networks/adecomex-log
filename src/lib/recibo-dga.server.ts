// Lectura del PDF «Recibo Pago de Impuestos» (comprobante de pago DGA): solo reglas fijas sobre el
// texto del PDF. No usa IA: si el texto no se puede leer, se informa el motivo para completar a mano.
import { textoPdfRenglones } from "./pdf-texto.server";
import { esReciboDga, reciboDgaDesdeTexto, type ReciboDga } from "./recibo-dga";

export type ResultadoLecturaRecibo = { recibo: ReciboDga | null; metodo: "texto"; motivo?: string | null };

const SIN_TEXTO = "El PDF no tiene texto legible (parece escaneado); completa la fecha de pago en la ficha.";

export async function leerReciboDgaPdf(bytes: Uint8Array): Promise<ResultadoLecturaRecibo> {
  let texto: string | null = null;
  try { texto = await textoPdfRenglones(bytes); } catch { texto = null; }
  if (!texto || !texto.trim()) return { recibo: null, metodo: "texto", motivo: SIN_TEXTO };
  const recibo = reciboDgaDesdeTexto(texto);
  if (recibo) return { recibo, metodo: "texto" };
  return {
    recibo: null,
    metodo: "texto",
    motivo: esReciboDga(texto)
      ? "No se pudieron leer los importes del comprobante; revisa el PDF o completa la fecha de pago a mano."
      : "El archivo no es un comprobante de pago de la DGA (no tiene «Recibo No.» ni «COMPROBANTE DE PAGO»).",
  };
}
