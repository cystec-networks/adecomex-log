import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REMINDER_CONFIG } from "./reminder-config";
import { severidadEtaProximo } from "./reminders-severidad";

// Regla del panel: la categoría "ETA / Expedientes" incluye expedientes con
// ETA en menos de 5 días; la ventana de expediente sigue en 3.
describe("ventana ETA del panel", () => {
  it("el panel incluye ETA hasta 5 días", () => {
    assert.equal(REMINDER_CONFIG.etaProximoDiasPanel, 5);
  });

  it("la alerta de expediente conserva su ventana propia", () => {
    assert.equal(REMINDER_CONFIG.etaProximoDias, 3);
  });

  it("los días 4 y 5 quedan con prioridad MEDIA", () => {
    assert.equal(severidadEtaProximo(4), "media");
    assert.equal(severidadEtaProximo(5), "media");
  });
});
