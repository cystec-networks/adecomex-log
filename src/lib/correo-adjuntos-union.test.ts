import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { agruparAdjuntosCorreo, nombreUnido, unirArchivosPdf } from "./correo-adjuntos-union";

const a = (nombre: string, tipo: string) => ({ nombre, tipo, storage_path: nombre });

describe("unión de adjuntos del mismo tipo", () => {
  it("3 certificados de análisis forman un grupo en orden de llegada", () => {
    const g = agruparAdjuntosCorreo([a("COA_19001122.PDF", "Certificado de análisis"), a("BL.pdf", "Bill of Lading"), a("COA P5026500685-95.PDF", "Certificado de análisis"), a("COA P5026500685-094.PDF", "Certificado de análisis")]);
    assert.deepEqual(g.map((x) => x.map((y) => y.nombre)), [["COA_19001122.PDF", "COA P5026500685-95.PDF", "COA P5026500685-094.PDF"], ["BL.pdf"]]);
  });
  it("dos facturas comerciales se agrupan; «Otro» nunca se une", () => {
    const g = agruparAdjuntosCorreo([a("F1.pdf", "Factura comercial"), a("x.pdf", "Otro"), a("F2.pdf", "Factura comercial"), a("y.pdf", "Otro")]);
    assert.equal(g.length, 3);
    assert.equal(g[0].length, 2);
  });
  it("nombre con cantidad", () => {
    assert.equal(nombreUnido("FAC-001 FACTURA COMERCIAL.pdf", 2), "FAC-001 FACTURA COMERCIAL (2 documentos).pdf");
  });
  it("concatena páginas", async () => {
    const mk = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return d.save(); };
    const out = await unirArchivosPdf([{ bytes: await mk(1), mime: "application/pdf" }, { bytes: await mk(2), mime: "application/pdf" }, { bytes: await mk(3), mime: "application/pdf" }]);
    assert.equal((await PDFDocument.load(out)).getPageCount(), 6);
  });
});
