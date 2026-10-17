import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filaArancelSchema, resolverTasaProducto, tasasSugeridasArancel, validarFilasArancel } from "./catalogo-arancelario";
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
  it("rechaza duplicados antes de cualquier escritura", () => assert.throws(() => validarFilasArancel([fila, fila]), /duplicado/));
  it("rechaza partida distinta", () => assert.equal(filaArancelSchema.safeParse({ ...fila, codigo_partida: "0801" }).success, false));
});