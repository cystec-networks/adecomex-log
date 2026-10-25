import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { totalDesdeTexto } from "./pago-puerto-texto";

describe("Total determinístico desde el texto del PDF", () => {
  it("Total DOP gana siempre a Totales (US$)", () => {
    const r = totalDesdeTexto("Totales (US$)\n708.00\nTotal DOP:\n42,480.00");
    assert.deepEqual([r?.monto, r?.moneda], [42480, "DOP"]);
    const r2 = totalDesdeTexto("Total DOP: 42,480.00\nTotales (US$) 708.00");
    assert.deepEqual([r2?.monto, r2?.moneda], [42480, "DOP"]);
  });
  it("ignora Sub Total DOP y toma Monto Total: DOP", () => {
    const r = totalDesdeTexto("Sub Total: DOP 36,710.32\nITBIS 6,607.86\nMonto Total: DOP 43,937.68");
    assert.deepEqual([r?.monto, r?.moneda], [43937.68, "DOP"]);
  });
  it("reconoce Monto DOP$ y Total RD$", () => {
    assert.equal(totalDesdeTexto("Monto DOP$: 37,170.00")?.monto, 37170);
    assert.equal(totalDesdeTexto("Total RD$ 35,612.94")?.monto, 35612.94);
  });
  it("respaldo en US$ solo si no hay total en DOP", () => {
    const r = totalDesdeTexto("Subtotal $ 600.00\nTotal US$ 708.00");
    assert.deepEqual([r?.monto, r?.moneda], [708, "USD"]);
  });
  it("sin patrón devuelve null para usar IA", () => {
    assert.equal(totalDesdeTexto("ALMACENAJE 5,055.12"), null);
  });
  it("mismo texto, mismo resultado", () => {
    const t = "Totales (US$) 708.00 Total DOP: 42,480.00";
    assert.deepEqual(totalDesdeTexto(t), totalDesdeTexto(t));
  });
});
