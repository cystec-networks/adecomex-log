import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { impuestoPantallaRd, impuestoEditadoUsd } from "./liquidacion-moneda";

describe("Impuestos RD$ solo en pantalla", () => {
  it("convierte US$ a RD$ con la tasa del expediente", () => {
    assert.equal(impuestoPantallaRd(500, 60), 30000);
    assert.equal(impuestoPantallaRd(0, 60), 0);
  });
  it("edita RD$ y conserva US$ sin comas ni redondeo de dólares al guardar", () => {
    const usd = impuestoEditadoUsd("31850.82", 60);
    assert.equal(usd, "530.847");
    assert.equal(impuestoPantallaRd(Number(usd), 60), 31850.82);
  });
  it("conserva vacíos y no inventa conversiones sin tasa", () => {
    assert.equal(impuestoEditadoUsd("", 60), "");
    assert.equal(impuestoPantallaRd(null, 60), null);
    assert.equal(impuestoPantallaRd(500, 0), null);
    assert.equal(impuestoEditadoUsd("500", 0), null);
  });
});