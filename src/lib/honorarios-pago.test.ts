import { test } from "node:test";
import assert from "node:assert/strict";
import { cambioPagoHonorario, honorariosParaCambio } from "./honorarios-pago";

test("revertir a pendiente elimina la fecha de pago 03/11/2026", () => {
  assert.deepEqual(cambioPagoHonorario("pendiente", "2026-11-03"), { pago_estado: "pendiente", fecha_pago: null });
});
test("selección mixta revierte solamente los honorarios pagados", () => {
  const filas = [{ id: "202610I381", estado: "pagado" as const }, { id: "202610I364", estado: "pendiente" as const }];
  assert.deepEqual(honorariosParaCambio(filas, "pendiente").map((fila) => fila.id), ["202610I381"]);
});
test("marcar pagado conserva la fecha elegida y exige una fecha", () => {
  assert.deepEqual(cambioPagoHonorario("pagado", "2026-11-03"), { pago_estado: "pagado", fecha_pago: "2026-11-03" });
  assert.throws(() => cambioPagoHonorario("pagado", ""));
});