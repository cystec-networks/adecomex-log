import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateOriginXml } from "./siga-certificado-origen-xml";

const exp = {
  suplidor: "Berkshire Dairy",
  suplidor_rnc: "270182962",
  pais_origen_codigo: "840",
};
const code = (xml: string, tag: string) => new RegExp(`<${tag}>(.*?)</${tag}>`).exec(xml)?.[1];

describe("CertificateOrigin: documentos de terceros sin país", () => {
  it("ExporterCode de Berkshire Dairy es exactamente TID270182962", () => {
    const xml = buildCertificateOriginXml(exp, [], { exportador: { doc: "TID270182962", pais: "840" } });
    assert.equal(code(xml, "ExporterCode"), "TID270182962");
  });

  it("ProductorCode de Berkshire Dairy es exactamente TID270182962", () => {
    const xml = buildCertificateOriginXml(exp, [], { productor: { doc: "TID270182962", pais: "840" } });
    assert.equal(code(xml, "ProductorCode"), "TID270182962");
  });

  it("respeta el prefijo RNC del ejemplo oficial sin insertar país", () => {
    const xml = buildCertificateOriginXml(exp, [], {
      exportador: { doc: "RNC3926955421254", pais: "840" },
      productor: { doc: "RNC3926955421254", pais: "214" },
    });
    assert.equal(code(xml, "ExporterCode"), "RNC3926955421254");
    assert.equal(code(xml, "ProductorCode"), "RNC3926955421254");
  });

  it("también excluye el país en documentos guardados sin formulario", () => {
    const xml = buildCertificateOriginXml(exp, []);
    assert.equal(code(xml, "ExporterCode"), "TID270182962");
    assert.equal(code(xml, "ProductorCode"), "TID270182962");
    const otro = buildCertificateOriginXml({ ...exp, certificado_productor_rnc: "RNC3926955421254" }, []);
    assert.equal(code(otro, "ProductorCode"), "RNC3926955421254");
  });

  it("conserva CED/PAS y el país de origen separado en las partidas", () => {
    const xml = buildCertificateOriginXml(exp, [{ codigo_arancelario: "04021000" }], {
      exportador: { doc: "CED00112345678", pais: "214" },
      productor: { doc: "PASAB123456", pais: "840" },
    });
    assert.equal(code(xml, "ExporterCode"), "CED00112345678");
    assert.equal(code(xml, "ProductorCode"), "PASAB123456");
    assert.equal(code(xml, "CountryCode"), "840");
  });
});