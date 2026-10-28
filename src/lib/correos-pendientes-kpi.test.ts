import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumirCorreosPendientes } from "./correos-pendientes-kpi";

describe("KPI de correos pendientes", () => {
  it("suma 3 borradores por convertir y 1 expediente por responder", () => {
    assert.deepEqual(resumirCorreosPendientes(3, [{ expediente_id: "exp-1", estado: "pendiente", enviado_en: null }]),
      { porConvertir: 3, porResponder: 1, total: 4 });
  });
  it("cuenta expedientes únicos, no filas repetidas de confirmación", () => {
    const fila = { expediente_id: "exp-1", estado: "pendiente", enviado_en: null };
    assert.equal(resumirCorreosPendientes(0, [fila, fila]).porResponder, 1);
  });
  it("una confirmación enviada nunca suma pendientes", () => {
    assert.equal(resumirCorreosPendientes(0, [
      { expediente_id: "exp-1", estado: "enviada", enviado_en: "2026-10-28T00:25:38Z" },
      { expediente_id: "exp-2", estado: "pendiente", enviado_en: "2026-10-28T00:25:38Z" },
    ]).total, 0);
  });
  it("sin borradores ni confirmaciones el total es cero", () => {
    assert.deepEqual(resumirCorreosPendientes(0, []), { porConvertir: 0, porResponder: 0, total: 0 });
  });
});