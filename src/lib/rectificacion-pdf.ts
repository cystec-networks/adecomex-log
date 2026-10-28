import { PDFDocument } from "@cantoo/pdf-lib";

/** Descifra PDFs que abren sin contraseña y conserva páginas, texto y vectores. */
export async function unirPdfsRectificacion(fuentes: { nombre: string; bytes: Uint8Array }[]) {
  const final = await PDFDocument.create();
  for (const fuente of fuentes) {
    try {
      const src = await PDFDocument.load(fuente.bytes, { password: "" });
      const paginas = await final.copyPages(src, src.getPageIndices());
      if (!paginas.length) throw new Error("Documento sin páginas");
      paginas.forEach((pagina) => final.addPage(pagina));
    } catch {
      throw new Error(`No se pudo incorporar ${fuente.nombre}. Verifique que el PDF se pueda abrir sin contraseña.`);
    }
  }
  return final.save();
}