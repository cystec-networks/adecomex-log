import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarPaisDocumento, resolverPaisDocumento, codigoEstadosUnidosDocumento } from "./pais-documento";

const catalogo = [
  { codigo: "581", pais: "ISLAS ULTRAMARINAS DE ESTADOS UNIDOS" },
  { codigo: "840", pais: "ESTADOS UNIDOS" },
  { codigo: "156", pais: "CHINA" },
];
describe("País documental sin inferencias insulares", () => {
  it("UNITED STATES en Portland/Oregon y Seattle/WA selecciona 840 aunque 581 esté primero", () => {
    const pais = normalizarPaisDocumento(catalogo[0].pais, "Shipper: Portland, Oregon, UNITED STATES");
    assert.equal(pais, "ESTADOS UNIDOS");
    assert.equal(resolverPaisDocumento(pais || "", catalogo).codigo, "840");
    assert.equal(codigoEstadosUnidosDocumento("Seattle, WA, USA"), "840");
  });
  it("USA, U.S.A., Estados Unidos y United States of America usan 840", () => {
    for (const texto of ["USA", "U.S.A.", "Estados Unidos", "United States of America", "840"]) {
      assert.equal(resolverPaisDocumento(texto, catalogo).codigo, "840");
    }
  });
  it("581 requiere un territorio insular explícito", () => {
    for (const territorio of ["Puerto Rico, USA", "Guam", "American Samoa", "Samoa Americana", "U.S. Virgin Islands", "Islas Vírgenes de EE.UU.", "Northern Mariana Islands", "Islas Marianas del Norte"]) {
      assert.equal(codigoEstadosUnidosDocumento(territorio), "581");
      assert.equal(resolverPaisDocumento(territorio, catalogo).codigo, "581");
      const normalizado = normalizarPaisDocumento(catalogo[0].pais, territorio);
      assert.equal(resolverPaisDocumento(normalizado || "", catalogo).codigo, "581");
    }
  });
  it("un código de puerto o el nombre genérico de 581 no autorizan 581", () => {
    for (const texto of ["USSEA", "USPDX", "Seattle, WA", "Portland, Oregon", "581", catalogo[0].pais]) {
      assert.equal(resolverPaisDocumento(texto, catalogo).codigo, null);
    }
    assert.equal(normalizarPaisDocumento(catalogo[0].pais), null);
  });
  it("conserva otros países exactos, no elige coincidencias parciales ni ambiguas", () => {
    assert.equal(resolverPaisDocumento("Chína", catalogo).codigo, "156");
    assert.equal(resolverPaisDocumento("China", [{ codigo: "999", pais: "CHINA INSULAR" }]).codigo, null);
    assert.equal(resolverPaisDocumento("China", [...catalogo, { codigo: "999", pais: "CHINA" }]).codigo, null);
  });
  it("no inventa una ficha 840 si el catálogo no la tiene", () => {
    assert.equal(resolverPaisDocumento("USA", [catalogo[0]]).codigo, null);
  });
});