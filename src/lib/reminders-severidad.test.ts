import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { severidadEtaProximo } from "./reminders-severidad";

// Regla del panel: ETA en 1 o 2 días = ALTA; 3 días o más = MEDIA.
describe("severidadEtaProximo", () => {
  test("marca ALTA con 1 día", () => {
    assert.equal(severidadEtaProximo(1), "alta");
  });
  test("marca ALTA con 2 días (antes salía MEDIA)", () => {
    assert.equal(severidadEtaProximo(2), "alta");
  });
  test("marca MEDIA con 3 días", () => {
    assert.equal(severidadEtaProximo(3), "media");
  });
  test("marca MEDIA con más días", () => {
    assert.equal(severidadEtaProximo(7), "media");
  });
});
