import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { separarArchivoJuego, gruposJuego, type ArchivoJuego } from "./juego-documentos";

const pdf = async (n: number) => { const p = await PDFDocument.create(); for (let i = 0; i < n; i++) p.addPage(); return p.save(); };
const a = (tipo: string): ArchivoJuego => ({ nombre: tipo, tipo, storage_path: tipo, mime: "application/pdf", bytes: new Uint8Array() });
describe("juego de documentos", () => {
  it("separa factura, BL y empaque de un único PDF sin llamada larga", async () => {
    const out = await separarArchivoJuego("juego.pdf", await pdf(3), ["COMMERCIAL INVOICE", "BILL OF LADING", "PACKING LIST"], async () => { throw new Error("No debe llamar IA para encabezados reconocidos"); }, () => {});
    assert.deepEqual(out.map((s) => s.tipo), ["Factura comercial", "Bill of Lading", "Lista de empaque"]);
    for (const s of out) assert.equal((await PDFDocument.load(s.bytes)).getPageCount(), 1);
  });
  it("une solo el mismo tipo y mantiene desconocidos separados", () => {
    const out = gruposJuego([a("Factura comercial"), a("Otro"), a("Factura comercial"), a("Otro")]);
    assert.deepEqual(out.map((g) => g.map((x) => x.tipo)), [["Factura comercial", "Factura comercial"], ["Otro"], ["Otro"]]);
  });
  it("fallo de clasificación conserva la página como Otro sin bloquear el BL", async () => {
    const out = await separarArchivoJuego("juego.pdf", await pdf(2), ["", "BILL OF LADING"], async () => { throw new Error("[524]"); }, () => {});
    assert.deepEqual(out.map((s) => s.tipo), ["Otro", "Bill of Lading"]);
  });
  it("continuación escaneada pertenece al documento anterior", async () => {
    const out = await separarArchivoJuego("juego.pdf", await pdf(2), ["BILL OF LADING", ""], async () => "Continuación", () => {});
    assert.equal(out.length, 1);
    assert.equal((await PDFDocument.load(out[0].bytes)).getPageCount(), 2);
  });
});