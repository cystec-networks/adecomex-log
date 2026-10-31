import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { entradasDocumentosZip, generarDocumentosZip } from "./documentos-zip";

describe("ZIP de documentos del expediente", () => {
  const declaracion = ["Factura comercial", "Bill of Lading", "Otro"];
  const liquidacion = ["Reporte de Liquidación de Impuestos", "Otro (Liquidación)"];
  it("excluye pendientes sin archivo incluso si están marcados recibidos", () => {
    const entradas = entradasDocumentosZip([
      { id: "1", tipo: "Factura comercial", storage_path: null },
      { id: "2", tipo: "Bill of Lading", storage_path: "" },
      { id: "3", tipo: "Factura comercial", storage_path: "exp/FAC-001 FACTURA COMERCIAL.pdf" },
    ], declaracion, liquidacion);
    assert.equal(entradas.length, 1);
    assert.equal(entradas[0]?.ruta, "Documentos Declaración/FAC-001 FACTURA COMERCIAL.pdf");
  });
  it("mantiene nombres codificados y separa Declaración y Liquidación", () => {
    const entradas = entradasDocumentosZip([
      { id: "1", tipo: "Bill of Lading", storage_path: "exp/1790000000000_DOE-001 BILL OF LADING.pdf" },
      { id: "2", tipo: "Reporte de Liquidación de Impuestos", storage_path: "exp/OTD-002 LIQUIDACION.pdf" },
    ], declaracion, liquidacion);
    assert.deepEqual(entradas.map((e) => e.ruta), ["Documentos Declaración/DOE-001 BILL OF LADING.pdf", "Documentos Liquidación/OTD-002 LIQUIDACION.pdf"]);
  });
  it("no pierde documentos con nombres repetidos", () => {
    const entradas = entradasDocumentosZip([1, 2].map((n) => ({ id: String(n), tipo: "Factura comercial", storage_path: "exp/FAC-001 FACTURA COMERCIAL.pdf" })), declaracion, liquidacion);
    assert.equal(entradas[1]?.ruta, "Documentos Declaración/FAC-001 FACTURA COMERCIAL (2).pdf");
  });
  it("preserva bytes originales en el ZIP", async () => {
    const entradas = entradasDocumentosZip([{ id: "1", tipo: "Bill of Lading", storage_path: "exp/DOE-001 BILL OF LADING.pdf" }], declaracion, liquidacion);
    const blob = await generarDocumentosZip(entradas, async () => new Blob(["%PDF-real-bytes"]), () => {});
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    assert.equal(await zip.file("Documentos Declaración/DOE-001 BILL OF LADING.pdf")?.async("string"), "%PDF-real-bytes");
  });
  it("no entrega un ZIP parcial si un archivo falla", async () => {
    const entradas = entradasDocumentosZip([{ id: "1", tipo: "Bill of Lading", storage_path: "exp/bl.pdf" }], declaracion, liquidacion);
    await assert.rejects(generarDocumentosZip(entradas, async () => { throw new Error("Sin acceso"); }, () => {}), /Sin acceso/);
  });
});