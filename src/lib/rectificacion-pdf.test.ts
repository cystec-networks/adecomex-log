import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { unirPdfsRectificacion } from "./rectificacion-pdf";

describe("paquete con oficio primero y BL protegido", () => {
  it("conserva la portada y las dos páginas del BL que abre sin contraseña", async () => {
    const oficio = await PDFDocument.create();
    oficio.addPage([612, 792]).drawText("Oficio 202609I334");
    const bl = await PDFDocument.create();
    bl.addPage([595, 842]).drawText("BL primera pagina");
    bl.addPage([595, 842]).drawText("BL segunda pagina");
    bl.encrypt({ userPassword: "", ownerPassword: "test-owner" });
    const bytes = await unirPdfsRectificacion([
      { nombre: "Oficio.pdf", bytes: await oficio.save() },
      { nombre: "BL.pdf", bytes: await bl.save() },
    ]);
    const resultado = await PDFDocument.load(bytes);
    assert.equal(resultado.getPageCount(), 3);
    assert.equal(resultado.getPage(0).getWidth(), 612);
    assert.equal(resultado.getPage(1).getWidth(), 595);
    assert.equal(resultado.isEncrypted, false);
  });
  it("no omite un documento obligatorio inválido", async () => {
    await assert.rejects(unirPdfsRectificacion([{ nombre: "BL.pdf", bytes: new Uint8Array([1, 2]) }]), /BL\.pdf/);
  });
});