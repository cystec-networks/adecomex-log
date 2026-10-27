import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarAdjuntosCorreo, mimeAdjuntoCorreo, datosDocumentalesCorreo } from "./correo-adjuntos";
import { fusionarAdjuntos } from "./correo-solicitud";

describe("recepción de archivos de correo", () => {
  it("acepta nombre tipo contenido y aliases de base64 sin perder el PDF", () => {
    const r = normalizarAdjuntosCorreo([{ nombre: "BL.pdf", tipo: "application/pdf", contenido: "JVBERi0xLjQ=" }, { filename: "BL2.pdf", mime_type: "application/pdf", contentBytes: "JVBERi0xLjQ=" }]);
    assert.equal(r.adjuntos.length, 2);
    assert.equal(r.adjuntos[1].contenido, "JVBERi0xLjQ=");
    assert.equal(r.advertencias.length, 0);
  });
  it("acepta contenidoBase64 tal como lo envía el script externo", () => {
    const r = normalizarAdjuntosCorreo([{ nombre: "BL.pdf", tipo: "application/pdf", contenidoBase64: "JVBERi0xLjQ=" }]);
    assert.equal(r.adjuntos.length, 1);
    assert.equal(r.adjuntos[0].contenido, "JVBERi0xLjQ=");
    assert.equal(r.advertencias.length, 0);
  });
  it("sin adjuntos acepta vacío, ausente y null", () => {
    for (const v of [[], undefined, null]) assert.deepEqual(normalizarAdjuntosCorreo(v), { adjuntos: [], advertencias: [] });
  });
  it("un archivo inválido genera aviso pero no pierde los demás", () => {
    const r = normalizarAdjuntosCorreo([{ nombre: "dañado.pdf" }, { nombre: "BL.pdf", contenido: "JVBERi0=" }]);
    assert.equal(r.adjuntos.length, 1);
    assert.equal(r.advertencias.length, 1);
    assert.match(r.advertencias[0], /dañado.pdf/);
  });
  it("PDF con parámetros e imágenes sin MIME se reconocen por tipo real", () => {
    assert.equal(mimeAdjuntoCorreo("BL.pdf", "application/pdf; name=BL.pdf", ""), "application/pdf");
    assert.equal(mimeAdjuntoCorreo("BL.JPG", "", ""), "image/jpeg");
    assert.equal(mimeAdjuntoCorreo("archivo", "", "data:image/png;base64,AAAA"), "image/png");
  });
  it("el documento completa ETA con prioridad y aviso de conflicto", () => {
    const r = fusionarAdjuntos({ bl_awb: null, eta: "2026-10-26", producto: null, cantidad: null, cliente_nombre: null }, [], [{ tipo: "Bill of Lading", eta: "29/10/2026", bl_awb: "BLPRUEBA270026" }]);
    assert.equal(r.datos.eta, "2026-10-29");
    assert.equal(r.datos.bl_awb, "BLPRUEBA270026");
    assert.equal(r.advertencias.length, 1);
  });
  it("Tipo de carga y contenedores del BL llegan al nuevo expediente; Otros no aporta datos", () => {
    const r = datosDocumentalesCorreo([{ nombre: "foto.png", tipo: "Otro", storage_path: "x", datos: { tipo_carga: "Courier" } }, { nombre: "BL.pdf", tipo: "Bill of Lading", storage_path: "bl", datos: { tipo_carga: "FCL", contenedores: [{ numero: "ABCD1234567" }] } }]);
    assert.equal(r.tipo_carga, "FCL");
    assert.deepEqual(r.contenedores, [{ numero: "ABCD1234567" }]);
  });
});
import { deduplicarAdjuntosCorreo } from "./correo-adjuntos";
describe("deduplicarAdjuntosCorreo", () => {
  it("guarda una sola vez el BL HBLIWF10012026-2.pdf repetido", () => {
    const r = deduplicarAdjuntosCorreo([
      { nombre: "HBLIWF10012026-2.pdf", tipo: "Bill of Lading" },
      { nombre: "COA_19001122.PDF", tipo: "Certificado de análisis" },
      { nombre: "HBLIWF10012026-2.pdf", tipo: "Bill of Lading" },
    ]);
    expect(r.map((a) => a.nombre)).toEqual(["HBLIWF10012026-2.pdf", "COA_19001122.PDF"]);
  });
  it("mismo tipo y contenido con distinto nombre cuenta como duplicado; distinto contenido no", () => {
    const r = deduplicarAdjuntosCorreo([
      { nombre: "a.pdf", tipo: "Factura comercial", file_hash: "h1" },
      { nombre: "b.pdf", tipo: "Factura comercial", file_hash: "h1" },
      { nombre: "c.pdf", tipo: "Factura comercial", file_hash: "h2" },
    ]);
    expect(r.map((a) => a.nombre)).toEqual(["a.pdf", "c.pdf"]);
  });
});
