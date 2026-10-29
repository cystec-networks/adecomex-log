import { describe, expect, it } from "bun:test";
import { detectarTipoPagina, esTimeoutGateway, segmentarPaginas, UMBRAL_PAGINAS_COMBINADO } from "./correo-documento-combinado";

describe("documentos combinados", () => {
  it("más de 4 páginas va a segundo plano", () => {
    expect(UMBRAL_PAGINAS_COMBINADO).toBe(4);
  });
  it("el error 524 del gateway se trata como documento combinado", () => {
    expect(esTimeoutGateway(new Error("AI Gateway error [524]: timeout"))).toBe(true);
    expect(esTimeoutGateway(new Error("AI Gateway error [400]: bad"))).toBe(false);
  });
  it("detecta encabezados y separa donde cambia el tipo", () => {
    const paginas = [
      "COMMERCIAL INVOICE No. 123 ...",
      "continuación de líneas de factura",
      "PACKING LIST ref invoice",
      "CERTIFICATE OF ORIGIN exporter",
      "CERTIFICATE OF PRODUCTION",
      "CERTIFICADO DE ORIGEN CAFTA-DR",
    ].map(detectarTipoPagina);
    const seg = segmentarPaginas(paginas);
    expect(seg.map((s) => [s.tipo, s.paginas])).toEqual([
      ["Factura comercial", [0, 1]],
      ["Lista de empaque", [2]],
      ["Certificado de origen", [3]],
      ["Otro", [4]],
      ["Certificado de origen", [5]],
    ]);
  });
  it("una página inicial sin encabezado queda sin clasificar", () => {
    expect(segmentarPaginas([null, detectarTipoPagina("BILL OF LADING")]).map((s) => s.tipo)).toEqual([null, "Bill of Lading"]);
  });
});
