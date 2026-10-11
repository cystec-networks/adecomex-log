import { describe, it, expect } from "vitest";
import { totalCostoMercanciaRd, filaReemplazadaPorServicio } from "./servicio-aduanero";

const filas = [
  { concepto: "Tasa Servicio Aduanero", monto_real: 8649.79 },
  { concepto: "Cargos Locales", monto_real: 2500 },
];

describe("Costo de mercancía y Servicio Aduanero automático", () => {
  it("sin fila automática, la Tasa Servicio Aduanero manual sí se suma", () => {
    expect(totalCostoMercanciaRd(filas, 0)).toBeCloseTo(11149.79, 2);
  });
  it("con fila automática con monto, la manual se excluye para no duplicar", () => {
    expect(totalCostoMercanciaRd(filas, 147.07)).toBe(2500);
    expect(filaReemplazadaPorServicio("Tasa Servicio Aduanero", 147.07)).toBe(true);
  });
  it("los demás conceptos nunca se reemplazan", () => {
    expect(filaReemplazadaPorServicio("Cargos Locales", 147.07)).toBe(false);
  });
});
