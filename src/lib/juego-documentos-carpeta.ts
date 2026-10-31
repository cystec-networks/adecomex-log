import { PDFDocument } from "@cantoo/pdf-lib";
import { base64Juego, separarArchivoJuego, type ArchivoJuego } from "./juego-documentos";
import { esDocumentoJuego, rutaArchivoJuego } from "./juego-documentos-seleccion";
import { optimizarArchivo, pdfProtegido } from "./documento-optimizacion";
import { unirArchivosPdf } from "./correo-adjuntos-union";

export type ArchivoCarpetaListo = { file: File; documentos: ArchivoJuego[] };
export type RevisionCarpeta = { listos: ArchivoCarpetaListo[]; rechazados: string[] };

/** Reject a whole source on uncertainty: never back up unidentified pages into Others. */
export function documentosCarpetaValidos(documentos: ArchivoJuego[]) {
  return documentos.length > 0 && documentos.every((d) => !!d.tipo && d.tipo !== "Otro");
}

async function pdfArchivo(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return bytes;
  if (/^image\/(png|jpeg)$/.test(file.type)) return new Uint8Array(await unirArchivosPdf([{ bytes, mime: file.type }]));
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("No se pudo leer la imagen"); }
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const png = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => b ? ok(b) : fail(new Error("Imagen no válida")), "image/png"));
  return new Uint8Array(await unirArchivosPdf([{ bytes: new Uint8Array(await png.arrayBuffer()), mime: "image/png" }]));
}

/** Entirely in memory; persistence is a separate, explicitly confirmed step. */
export async function revisarArchivosCarpeta(files: File[], leer: (base64: string) => Promise<string>, clasificar: (nombre: string, base64: string) => Promise<string>, progreso: (texto: string) => void): Promise<RevisionCarpeta> {
  const listos: ArchivoCarpetaListo[] = [], rechazados: string[] = [];
  for (const original of files) {
    const nombre = rutaArchivoJuego(original);
    progreso(`Identificando ${nombre}…`);
    if (!esDocumentoJuego(original)) { rechazados.push(nombre); continue; }
    try {
      const analizar = async (file: File) => {
        const bytes = await pdfArchivo(file);
        const src = await PDFDocument.load(bytes, { password: "", updateMetadata: false } as any);
        const textos: string[] = [];
        for (let i = 0; i < src.getPageCount(); i++) {
          progreso(`${nombre} · página ${i + 1} de ${src.getPageCount()}`);
          const page = await PDFDocument.create();
          (await page.copyPages(src, [i])).forEach((p) => page.addPage(p));
          try { textos.push(await leer(base64Juego(await page.save()))); } catch { textos.push(""); }
        }
        let documentos = await separarArchivoJuego(nombre.replace(/\.[^.]+$/, ".pdf"), bytes, textos, clasificar, progreso);
        if (await pdfProtegido(bytes)) {
          // Recognition copies may be inspected, but the persisted signed source stays byte-identical.
          if (!documentosCarpetaValidos(documentos) || new Set(documentos.map((d) => d.tipo)).size !== 1) return [];
          documentos = [{ ...documentos[0], nombre, bytes, firmado: true }];
        }
        return documentos;
      };
      let file = await optimizarArchivo(original);
      let documentos = await analizar(file);
      if (file !== original && !documentosCarpetaValidos(documentos)) { file = original; documentos = await analizar(original); }
      if (documentosCarpetaValidos(documentos)) listos.push({ file, documentos });
      else rechazados.push(nombre);
    } catch { rechazados.push(nombre); }
  }
  return { listos, rechazados };
}