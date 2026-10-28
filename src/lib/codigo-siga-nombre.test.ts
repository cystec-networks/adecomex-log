import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nombreDocumentoSiga } from "./codigo-siga";

describe("nombreDocumentoSiga", () => {
  it("usa código y tipo", () => {
    assert.equal(nombreDocumentoSiga("FAC-001", "Factura comercial", "R55_RI.pdf"), "FAC-001 FACTURA COMERCIAL.pdf");
    assert.equal(nombreDocumentoSiga("DOE-001", "Bill of Lading", "HBL.pdf"), "DOE-001 BILL OF LADING.pdf");
    assert.equal(nombreDocumentoSiga("PER-002", "Certificado de análisis", "COA.PDF"), "PER-002 CERTIFICADO DE ANALISIS.pdf");
  });
  it("Otro reconoce seguro", () => {
    assert.equal(nombreDocumentoSiga("OTD-002", "Otro", "Certificate_of_Insurance_x.pdf"), "OTD-002 CERTIFICADO DE SEGURO.pdf");
    assert.equal(nombreDocumentoSiga("OTD-003", "Otro", "scan.pdf"), "OTD-003 OTRO DOCUMENTO.pdf");
  });
});
