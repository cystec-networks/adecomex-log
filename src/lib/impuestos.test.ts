import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcImpuestosLinea, tasaItbisCapturada } from "./impuestos";

describe("ITBIS de la Calculadora Rápida", () => {
  it("línea y escenario vacíos aplican el 18 % general", () => {
    const pct = tasaItbisCapturada("", "");
    assert.equal(pct, null);
    const r = calcImpuestosLinea(1000, 1000, 0, 0, 0, 0, false, 0, pct);
    assert.equal(r.itbis, 180);
  });
  it("la tasa de la línea tiene prioridad sobre la del escenario", () => {
    assert.equal(tasaItbisCapturada("16", "18"), 16);
    assert.equal(tasaItbisCapturada("", "16"), 16);
  });
  it("un 0 % capturado se respeta (exento)", () => {
    const r = calcImpuestosLinea(1000, 1000, 0, 0, 0, 0, false, 0, tasaItbisCapturada("0", ""));
    assert.equal(r.itbis, 0);
  });
});
