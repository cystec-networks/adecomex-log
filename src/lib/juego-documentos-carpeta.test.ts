import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { revisarArchivosCarpeta, documentosCarpetaValidos } from "./juego-documentos-carpeta";
import { gruposJuego, type ArchivoJuego } from "./juego-documentos";
import { tipoPaginaConfiable } from "./juego-documentos-confianza";

async function archivo(nombre: string, paginas = 1) {
  const pdf = await PDFDocument.create(); for (let i = 0; i < paginas; i++) pdf.addPage();
  return new File([await pdf.save()], nombre, { type: "application/pdf" });
}
describe("revisión exclusiva de carpetas", () => {
  it("exige confianza alta y evidencia antes de aceptar clasificación de carpeta", () => {
    assert.equal(tipoPaginaConfiable({ tipo_documento: "Bill of Lading", confianza: "media", evidencia: "BILL OF LADING" }), "Otro");
    assert.equal(tipoPaginaConfiable({ tipo_documento: "Bill of Lading", confianza: "alta", evidencia: "" }), "Otro");
    assert.equal(tipoPaginaConfiable({ tipo_documento: "Bill of Lading", confianza: "alta", evidencia: "BILL OF LADING" }), "Bill of Lading");
  });
  it("solo prepara reconocidos y enumera desconocidos sin persistencia", async () => {
    const revision = await revisarArchivosCarpeta([await archivo("factura.pdf"), await archivo("irrelevante.pdf"), new File(["nota"], "nota.txt", { type: "text/plain" })], async () => "", async (nombre) => nombre.startsWith("factura") ? "Factura comercial" : "Otro", () => {});
    assert.equal(revision.listos.length, 1);
    assert.deepEqual(revision.listos[0].documentos.map((d) => d.tipo), ["Factura comercial"]);
    assert.deepEqual(revision.rechazados, ["irrelevante.pdf", "nota.txt"]);
  });
  it("un timeout excluye el archivo, no bloquea los demás", async () => {
    const revision = await revisarArchivosCarpeta([await archivo("error.pdf"), await archivo("bl.pdf")], async () => "", async (nombre) => { if (nombre.startsWith("error")) throw new Error("524"); return "Bill of Lading"; }, () => {});
    assert.deepEqual(revision.rechazados, ["error.pdf"]);
    assert.equal(revision.listos[0].documentos[0].tipo, "Bill of Lading");
  });
  it("PDF combinado parcialmente desconocido se excluye completo", async () => {
    let n = 0;
    const revision = await revisarArchivosCarpeta([await archivo("combinado.pdf", 2)], async () => "", async () => ++n % 2 === 1 ? "Factura comercial" : "Otro", () => {});
    assert.equal(revision.listos.length, 0);
    assert.deepEqual(revision.rechazados, ["combinado.pdf"]);
  });
  it("archivos individuales conservan desconocidos como Otros", () => {
    const desconocido: ArchivoJuego = { nombre: "archivo.pdf", tipo: "Otro", bytes: new Uint8Array(), mime: "application/pdf", storage_path: "archivo.pdf" };
    assert.equal(documentosCarpetaValidos([desconocido]), false);
    assert.equal(gruposJuego([desconocido])[0][0].tipo, "Otro");
  });
});