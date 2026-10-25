import { expect, test } from "bun:test";
import { fmtRD, precioBase } from "./facturas-ecf";

test("precioBase suma subtotals gravado y exento (E310000000360)", () => {
  const f = { subtotal_gravado: "13500.00", subtotal_exento: "0.00", total_itbis: "2430.00", monto_total: "15930.00" };
  expect(precioBase(f)).toBe(13500);
  expect(precioBase(f) + Number(f.total_itbis)).toBe(Number(f.monto_total));
});

test("precioBase incluye la parte exenta y tolera valores vacíos", () => {
  expect(precioBase({ subtotal_gravado: 1000.5, subtotal_exento: 250.25 })).toBe(1250.75);
  expect(precioBase({ subtotal_gravado: null, subtotal_exento: undefined })).toBe(0);
});

test("fmtRD muestra miles y dos decimales", () => {
  expect(fmtRD(15930)).toBe("RD$ 15,930.00");
});
