import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filaArancelSchema, resolverTasaProducto, resolverSugerenciasProducto, tasasSugeridasArancel, validarFilasArancel } from "./catalogo-arancelario";
describe("Prioridad de sugerencias en las tres pantallas", () => {
  const cebollas = { gravamen_pct: 25, exento_itbis: true };
  const viejo = { pct_gravamen: 8, pct_itbis: 18, aplica_isc: true, pct_isc: 10 };
  it("0703.10.11 usa 25% y 0% oficiales en vez del historial", () => {
    const r = resolverSugerenciasProducto({}, cebollas, viejo);
    assert.equal(r.pct_gravamen, "25"); assert.equal(r.pct_itbis, "0");
  });
  it("respeta tasas manuales guardadas, incluido cero e ISC", () => {
    const r = resolverSugerenciasProducto({ pct_gravamen: 0, pct_itbis: 18, aplica_isc: true, pct_isc: 5 }, cebollas, viejo);
    assert.deepEqual(r, { pct_gravamen: "0", pct_itbis: "18", aplica_isc: true, pct_isc: "5" });
  });
  it("ITBIS oficial sin dato queda vacío aunque el historial tenga 18", () => {
    assert.equal(resolverSugerenciasProducto({}, { gravamen_pct: 8, exento_itbis: null }, viejo).pct_itbis, "");
  });
  it("solo una partida ausente usa el autoaprendizaje, incluido ISC", () => {
    assert.deepEqual(resolverSugerenciasProducto({}, null, viejo), { pct_gravamen: "8", pct_itbis: "18", aplica_isc: true, pct_isc: "10" });
  });
  it("sin fuentes no inventa 18 ni un gravamen", () => {
    const r = resolverSugerenciasProducto({}, null, null);
    assert.equal(r.pct_itbis, ""); assert.equal(r.pct_gravamen, "");
  });
});
describe("Sugerencias oficiales sin reemplazar overrides", () => {
  it("mantiene el cero manual por encima del gravamen sugerido", () => assert.equal(resolverTasaProducto(0, 20), "0"));
  it("mantiene una tasa manual positiva", () => assert.equal(resolverTasaProducto("8", 20), "8"));
  it("sugiere gravamen solo en campo vacío", () => assert.equal(resolverTasaProducto("", 20), "20"));
  it("ITBIS exento sugiere cero", () => assert.equal(tasasSugeridasArancel({ gravamen_pct: 20, exento_itbis: true }).itbis, 0));
  it("ITBIS en blanco no inventa un valor", () => assert.equal(tasasSugeridasArancel({ gravamen_pct: null, exento_itbis: null }).itbis, null));
});
describe("CSV sin pérdida de códigos ni nulos", () => {
  const fila = { codigo: "0709.60.13", codigo_partida: "0709", descripcion: "Dato de prueba, no se importa", capitulo: "7", capitulo_titulo: "Prueba", seccion: "II", gravamen_pct: "", exento_itbis: "", nivel: "3", es_hoja: "true" };
  it("preserva ceros iniciales y defaults", () => { const r = filaArancelSchema.parse(fila); assert.equal(r.codigo_partida, "0709"); assert.equal(r.vigente_desde, "2022-01-01"); assert.equal(r.activo, true); assert.equal(r.gravamen_pct, null); assert.equal(r.exento_itbis, null); });
  it("capitulo vacío se guarda como nulo", () => assert.equal(filaArancelSchema.parse({ ...fila, capitulo: "" }).capitulo, null));
  it("omite duplicados y reporta la fila sin detener la validación", () => { const r = validarFilasArancel([fila, fila]); assert.equal(r.filas.length, 1); assert.equal(r.errores.length, 1); assert.match(r.errores[0].mensaje, /duplicado/); });
  it("omite filas inválidas y sigue con las demás", () => { const r = validarFilasArancel([{ ...fila, codigo_partida: "0801" }, fila]); assert.equal(r.filas.length, 1); assert.equal(r.errores.length, 1); assert.equal(r.errores[0].fila, 2); });
});
