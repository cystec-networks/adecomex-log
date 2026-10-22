import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { desdeCatalogo, docConPrefijo, resolverTerceroCertificado, type TerceroRegistro } from "./terceros-certificado";
const contacto = { nombre: "BERKSHIRE DAIRY AND FOOD PRODUCTS", direccion: "850 N Wyomissing Blvd; Suite 1  Wyomissing PA 19610", telefono: "+1 610-378-9999", fax: "(610) 378-4975", email: "info@berkshiredairy.com", pais_nombre: "ESTADOS UNIDOS", pais_codigo: "840" };
const rows: TerceroRegistro[] = [
  { ...contacto, tid: "270182962", rol_siga: "proveedora_exterior" },
  { ...contacto, tid: "0007030022", rol_siga: "exportadora" },
];
describe("Terceros del certificado por rol SIGA", () => {
  it("Exportador prioriza 0007030022 conservando ceros y todos los contactos", () => {
    const r = resolverTerceroCertificado(rows, "exportadora", contacto.nombre, "270182962");
    assert.ok(r);
    assert.deepEqual(desdeCatalogo(r), { ...contacto, tipo_doc: "TID", doc: "0007030022" });
    assert.equal(docConPrefijo(desdeCatalogo(r)), "TID0007030022");
  });
  it("Productor resuelve TID270182962 guardado sin perder los demás campos", () => {
    const r = resolverTerceroCertificado(rows, "proveedora_exterior", contacto.nombre, "270182962", "TID270182962");
    assert.ok(r);
    assert.deepEqual(desdeCatalogo(r), { ...contacto, tipo_doc: "TID", doc: "270182962" });
    assert.equal(docConPrefijo(desdeCatalogo(r)), "TID270182962");
  });
  it("Productor busca su ficha aunque el suplidor sea Exportadora", () => {
    assert.equal(resolverTerceroCertificado(rows, "proveedora_exterior", contacto.nombre, "0007030022")?.tid, "270182962");
  });
  it("un Productor distinto guardado tiene su propio contacto", () => {
    const otro = { ...contacto, nombre: "OTRO PRODUCTOR", tid: "PASABC123", rol_siga: "proveedora_exterior" as const };
    assert.equal(resolverTerceroCertificado([...rows, otro], "proveedora_exterior", contacto.nombre, "270182962", "PASABC123"), otro);
    assert.equal(resolverTerceroCertificado(rows, "proveedora_exterior", contacto.nombre, "270182962", "PASABC123"), null);
  });
  it("catálogos históricos sin rol siguen resolviendo prefijos equivalentes", () => {
    const legacy = { ...contacto, tid: "270182962" };
    assert.equal(resolverTerceroCertificado([legacy], "proveedora_exterior", "", "TID270182962"), legacy);
  });
  it("no utiliza la ficha de un rol opuesto como sustituto", () => {
    assert.equal(resolverTerceroCertificado([rows[1]], "proveedora_exterior", contacto.nombre, "0007030022"), null);
  });
});