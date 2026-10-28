import { describe, it, expect } from "vitest";
import { nombreDocumentoSiga } from "./codigo-siga";
describe("nombreDocumentoSiga", () => {
  it("usa código y tipo", () => {
    expect(nombreDocumentoSiga("FAC-001", "Factura comercial", "R55_RI.pdf")).toBe("FAC-001 FACTURA COMERCIAL.pdf");
    expect(nombreDocumentoSiga("DOE-001", "Bill of Lading", "HBL.pdf")).toBe("DOE-001 BILL OF LADING.pdf");
    expect(nombreDocumentoSiga("PER-002", "Certificado de análisis", "COA.PDF")).toBe("PER-002 CERTIFICADO DE ANALISIS.pdf");
  });
  it("Otro reconoce seguro", () => {
    expect(nombreDocumentoSiga("OTD-002", "Otro", "Certificate_of_Insurance_x.pdf")).toBe("OTD-002 CERTIFICADO DE SEGURO.pdf");
    expect(nombreDocumentoSiga("OTD-003", "Otro", "scan.pdf")).toBe("OTD-003 OTRO DOCUMENTO.pdf");
  });
});
