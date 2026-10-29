import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectarTipoPagina, esTimeoutGateway, segmentarPaginas, UMBRAL_PAGINAS_COMBINADO } from "./correo-documento-combinado";

describe("documentos combinados", () => {
  it("más de 4 páginas va a segundo plano", () => {
    assert.equal(UMBRAL_PAGINAS_COMBINADO, 4);
  });
  it("el error 524 del gateway se trata como documento combinado", () => {
    assert.equal(esTimeoutGateway(new Error("AI Gateway error [524]: timeout")), true);
    assert.equal(esTimeoutGateway(new Error("AI Gateway error [400]: bad")), false);
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
    assert.deepEqual(seg.map((s) => [s.tipo, s.paginas]), [
      ["Factura comercial", [0, 1]],
      ["Lista de empaque", [2]],
      ["Certificado de origen", [3]],
      ["Otro", [4]],
      ["Certificado de origen", [5]],
    ]);
  });
  it("una página inicial sin encabezado queda sin clasificar", () => {
    assert.deepEqual(segmentarPaginas([null, detectarTipoPagina("BILL OF LADING")]).map((s) => s.tipo), [null, "Bill of Lading"]);
  });
});
