import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { datosProductoHistorico, type DgaProducto } from "./dga-productos";
import { resolverSugerenciasProducto } from "./catalogo-arancelario";

const producto: DgaProducto = {
  codigo_producto: "DGA-TEST", partida_arancelaria: "0703.10.11", nombre_producto: "Cebollas",
  unidad: "Kilogramo", cod_marca: null, marca: null, cod_modelo: null, modelo: null,
  pais: null, especificaciones: "Frescas", regimen: null, estado: null,
};
const anterior = {
  codigo_arancelario: "3002.90.10", detalle_producto: "Fermento", unidad_medida: "Unidad",
  unidad_codigo: "U", marca: "Anterior", modelo: "Viejo", especificaciones: "Viejas",
  cantidad: "17", peso: "21.8", valor_fob: "1349.1234",
  pct_gravamen: "8", pct_itbis: "18", aplica_isc: true, pct_isc: "10",
};
const aplicar = (p = producto, reusar = true) => ({
  ...anterior,
  ...datosProductoHistorico(p, reusar, resolverSugerenciasProducto(p, { gravamen_pct: 25, exento_itbis: true }, null)),
});
describe("Reemplazo explícito del histórico en Editar ítem", () => {
  it("reemplaza código, detalle, unidad y datos SIGA sin arrastrar la unidad anterior", () => {
    const r = aplicar();
    assert.equal(r.codigo_arancelario, "0703.10.11"); assert.equal(r.detalle_producto, "Cebollas");
    assert.equal(r.unidad_medida, "Kilogramo"); assert.equal(r.unidad_codigo, "");
    assert.equal(r.marca, ""); assert.equal(r.modelo, ""); assert.equal(r.especificaciones, "Frescas");
  });
  it("conserva la cantidad de la línea actual", () => assert.equal(aplicar().cantidad, "17"));
  it("conserva el peso de la línea actual", () => assert.equal(aplicar().peso, "21.8"));
  it("conserva el FOB de la línea actual con cuatro decimales", () => assert.equal(aplicar().valor_fob, "1349.1234"));
  it("reemplaza Gravamen e ITBIS anteriores por 25% y 0% de la nueva partida", () => {
    const r = aplicar(); assert.equal(r.pct_gravamen, "25"); assert.equal(r.pct_itbis, "0");
    assert.equal(r.aplica_isc, false); assert.equal(r.pct_isc, "");
  });
  it("prioriza las tasas propias del producto seleccionado, no las del anterior", () => {
    const r = aplicar({ ...producto, pct_gravamen: 0, pct_itbis: 9, aplica_isc: true, pct_isc: 5 });
    assert.equal(r.pct_gravamen, "0"); assert.equal(r.pct_itbis, "9"); assert.equal(r.pct_isc, "5");
  });
  it("borra tasas viejas cuando el nuevo producto no tiene ninguna fuente", () => {
    const r = { ...anterior, ...datosProductoHistorico(producto, false, resolverSugerenciasProducto({}, null, null)) };
    assert.equal(r.pct_gravamen, ""); assert.equal(r.pct_itbis, "");
  });
  it("respeta ambas opciones de ProductCode", () => {
    assert.equal(aplicar().product_code, "DGA-TEST"); assert.equal(aplicar(producto, false).product_code, "");
  });
});