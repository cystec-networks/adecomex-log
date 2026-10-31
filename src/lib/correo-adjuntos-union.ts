import { PDFDocument } from "pdf-lib";
import { pdfProtegido } from "./documento-optimizacion";

export type AdjuntoCorreoBase = { nombre: string; tipo: string; storage_path: string; firmado?: boolean };

const esOtro = (tipo: string | null | undefined) => !tipo || tipo === "Otro" || tipo.startsWith("Otros");

/** Agrupa por tipo reconocido conservando el orden de llegada; «Otro» nunca se une. */
export function agruparAdjuntosCorreo<T extends AdjuntoCorreoBase>(adjuntos: T[]): T[][] {
  const grupos: T[][] = [];
  const porTipo = new Map<string, T[]>();
  for (const a of adjuntos) {
    if (esOtro(a.tipo) || a.firmado) { grupos.push([a]); continue; }
    const g = porTipo.get(a.tipo);
    if (g) g.push(a);
    else { const nuevo = [a]; porTipo.set(a.tipo, nuevo); grupos.push(nuevo); }
  }
  return grupos;
}

/** «FAC-001 FACTURA COMERCIAL.pdf» → «FAC-001 FACTURA COMERCIAL (2 documentos).pdf». */
export function nombreUnido(nombreSimple: string, cantidad: number) {
  return nombreSimple.replace(/\.[a-z0-9]{2,5}$/i, "") + ` (${cantidad} documentos).pdf`;
}

export const etiquetaOriginalIncluido = (codigo: string) => `Original — ya incluido en ${codigo}`;

/** Concatena PDFs e imágenes (una página por imagen) en el orden recibido. */
export async function unirArchivosPdf(archivos: { bytes: Uint8Array; mime: string }[]) {
  const destino = await PDFDocument.create();
  for (const { bytes, mime } of archivos) {
    if (mime === "image/png" || mime === "image/jpeg") {
      const img = mime === "image/png" ? await destino.embedPng(bytes) : await destino.embedJpg(bytes);
      destino.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      continue;
    }
    if (await pdfProtegido(bytes)) throw new Error("PDF firmado o protegido: se conserva intacto; no se puede unir sin alterar su firma.");
    const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const paginas = await destino.copyPages(origen, origen.getPageIndices());
    paginas.forEach((p) => destino.addPage(p));
  }
  return destino.save();
}
