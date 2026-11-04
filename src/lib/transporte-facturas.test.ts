import { expect, test } from "bun:test";
import { totalFacturasTransporte } from "./transporte-facturas";
test("flete y retorno suman sus dos montos para el mismo transporte", () => {
  expect(totalFacturasTransporte([
    { id: "ida", encf: "E310000000001", monto_total: 10000, fecha_emision: "2026-11-03" },
    { id: "retorno", encf: "E310000000002", monto_total: 2500, fecha_emision: "2026-11-04" },
  ])).toBe(12500);
});
test("la misma factura no se suma dos veces", () => {
  const f = { id: "ida", encf: "E310000000001", monto_total: 10000, fecha_emision: "2026-11-03" };
  expect(totalFacturasTransporte([f, f])).toBe(10000);
});