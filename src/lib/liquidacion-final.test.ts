import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularResultadosLiquidacion, type FilaCalc } from "./liquidacion-final";

const calcFila = (): FilaCalc => ({
  fob: 1000,
  est: { gravamen: 0, selectivo: 0, itbis: 0, cifLinea: 1000 },
  cant: 1,
  gr: 0,
  ir: 0,
  tr: 0,
  cv: null,
  costoUnit: 0,
});

const base = {
  exp: { seguro: 0, flete: 0, otros: 0 },
  list: [{ detalle_producto: "X", valor_fob: 1000 }],
  calcFila,
  gastosAdicionales: 0,
  servicioUsd: 0,
  tasaCambio: 60,
};

describe("calcularResultadosLiquidacion con costos en US$", () => {
  it("una fila en USD se muestra como dólares y entra a los totales", () => {
    const r = calcularResultadosLiquidacion({
      ...base,
      gastosAdicionalesUsdDirecto: 500,
      costosProducto: [{ concepto: "Cargos THC", monto_real: 500, moneda: "USD" }],
    });
    const fila = r.costosMercancia.find((c) => c.concepto === "Cargos THC")!;
    assert.equal(fila.usd, 500);
    assert.equal(fila.dop, 30000);
    assert.ok(Math.abs(r.costosTotal.usd! - (500 + 258.26 / 60)) < 0.01);
    assert.ok(Math.abs(r.costosTotal.dop - (30000 + 258.26)) < 0.01);
    assert.equal(r.componentes.costoMercanciaUsd, 500);
  });

  it("una fila en DOP sigue comportándose como antes", () => {
    const r = calcularResultadosLiquidacion({
      ...base,
      gastosAdicionales: 6000,
      costosProducto: [{ concepto: "Manejo", monto_real: 6000, moneda: "DOP" }],
    });
    const fila = r.costosMercancia.find((c) => c.concepto === "Manejo")!;
    assert.equal(fila.dop, 6000);
    assert.equal(fila.usd, 100);
    assert.equal(r.componentes.costoMercanciaUsd, 100);
  });
});
