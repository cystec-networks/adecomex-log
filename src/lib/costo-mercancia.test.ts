import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { totalCostoMercanciaRd, filaReemplazadaPorServicio } from "./costo-mercancia";

const filas = [
  { concepto: "Tasa Servicio Aduanero", monto_real: 8649.79 },
  { concepto: "Cargos Locales", monto_real: 2500 },
];

describe("Costo de mercancía y Servicio Aduanero automático", () => {
  test("sin fila automática, la Tasa Servicio Aduanero manual sí se suma", () => {
    assert.equal(Math.round(totalCostoMercanciaRd(filas, 0) * 100), 1114979);
  });
  test("con fila automática con monto, la manual se excluye para no duplicar", () => {
    assert.equal(totalCostoMercanciaRd(filas, 147.07), 2500);
    assert.equal(filaReemplazadaPorServicio("Tasa Servicio Aduanero", 147.07), true);
  });
  test("los demás conceptos nunca se reemplazan", () => {
    assert.equal(filaReemplazadaPorServicio("Cargos Locales", 147.07), false);
  });
});

describe("Formulario DUA automático", () => {
  test("la fila manual 'Declaración Única Aduanera' nunca se suma (evita doble conteo)", () => {
    assert.equal(totalCostoMercanciaRd([{ concepto: "Declaración Única Aduanera", monto_real: 258.26 }, { concepto: "Otros", monto_real: 100 }], 0), 100);
  });
});
