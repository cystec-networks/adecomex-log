import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolverArancelCopiloto, columnasExcelClasificacion, filaClasificacionSchema } from "./copiloto-facturas";

describe("Coincidencias del Copiloto con el arancel nacional", () => {
  const vacuna = { codigo: "3002.41.00", gravamen_pct: 0, exento_itbis: true, es_hoja: true };
  it("3002.41.00.00 encuentra 3002.41.00 sin inventar códigos", () => assert.deepEqual(resolverArancelCopiloto("3002.41.00.00", [vacuna]), vacuna));
  it("acepta el mismo código sin puntos", () => assert.deepEqual(resolverArancelCopiloto("3002410000", [vacuna]), vacuna));
  it("9027.90.00.00 no toma los impuestos de 9027.90.10 ni 9027.90.90", () => assert.equal(resolverArancelCopiloto("9027.90.00.00", [
    { ...vacuna, codigo: "9027.90", es_hoja: false }, { ...vacuna, codigo: "9027.90.10" }, { ...vacuna, codigo: "9027.90.90" },
  ]), null));
  it("prefiere la coincidencia exacta de diez dígitos", () => { const exacta = { ...vacuna, codigo: "3002410000", gravamen_pct: 5 }; assert.equal(resolverArancelCopiloto("3002.41.00.00", [vacuna, exacta]), exacta); });
  it("mantiene sin sugerencia una línea sin partida", () => assert.equal(resolverArancelCopiloto("", [vacuna]), null));
});
describe("Instantánea y Excel", () => {
  it("conserva descripción, partida y tasas numéricas incluyendo cero y vacío", () => {
    const fila = filaClasificacionSchema.parse({ descripcion: "Producto", cantidad: 1, unidad: null, partida: "3002.41.00.00", gravamen: 0, itbis: null, enArancel: true, insuficiente: false });
    assert.deepEqual(columnasExcelClasificacion([fila]), [["Producto", "3002.41.00.00", 0, null]]);
  });
});