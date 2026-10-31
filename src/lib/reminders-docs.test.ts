import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { idsExpedientesConDocumentos } from "./reminders-docs";

// Regla del panel: verde (con documentos) cuando hay al menos un documento
// subido; gris (sin documentos) cuando no hay ninguno.
describe("idsExpedientesConDocumentos", () => {
  test("marca verde solo a expedientes con documento subido", () => {
    const ids = idsExpedientesConDocumentos([
      { expediente_id: "a" },
      { expediente_id: "b" },
    ]);
    assert.equal(ids.has("a"), true);
    assert.equal(ids.has("b"), true);
    assert.equal(ids.has("c"), false);
  });
  test("sin documentos ningún expediente queda verde", () => {
    const ids = idsExpedientesConDocumentos([]);
    assert.equal(ids.size, 0);
  });
  test("ignora filas sin expediente", () => {
    const ids = idsExpedientesConDocumentos([
      { expediente_id: "" },
    ] as any);
    assert.equal(ids.size, 0);
  });
});
