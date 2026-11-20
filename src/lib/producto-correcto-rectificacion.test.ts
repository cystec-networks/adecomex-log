import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { autoguardaProductoCorrecto, cambioProductoCorrecto } from "./producto-correcto-rectificacion";

describe("Producto correcto (Rectificación técnica)", () => {
  test("limpia los espacios al inicio y al final antes de guardar", () => {
    assert.deepEqual(cambioProductoCorrecto("  Harina de trigo  ", ""), { cambia: true, valor: "Harina de trigo" });
  });
  test("no guarda si el valor no cambió (solo se añadieron espacios)", () => {
    assert.equal(cambioProductoCorrecto(" Harina de trigo ", "Harina de trigo").cambia, false);
  });
  test("vaciar el campo sí es un cambio", () => {
    assert.deepEqual(cambioProductoCorrecto("   ", "Harina de trigo"), { cambia: true, valor: "" });
  });
  test("en un Expediente nuevo no se autoguarda: se guarda con Crear Expediente", () => {
    assert.equal(autoguardaProductoCorrecto(true, true), false);
  });
  test("en un Expediente creado solo autoguarda quien puede editarlo", () => {
    assert.equal(autoguardaProductoCorrecto(false, true), true);
    assert.equal(autoguardaProductoCorrecto(false, false), false);
  });
});
