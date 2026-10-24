import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costosAutomaticosLiquidacion } from "./costos-automaticos-liquidacion";
import { totalCostoMercanciaRd, FORMULARIO_DUA_RD } from "./costo-mercancia";
import { calcularResultadosLiquidacion, costoUnitarioReal } from "./liquidacion-final";

describe("Costos automáticos de Liquidación", () => {
  it("solo toma Costo del Viaje terrestre vigente, sin ingresos ni descuentos", () => {
    const filas = costosAutomaticosLiquidacion([
      { tipo: "terrestre", costo_viaje: "12000" },
      { tipo: "aereo", costo_viaje: 9000 },
      { tipo: "terrestre", costo_viaje: 3000, eliminado_en: "2026-10-24" },
    ]);
    assert.equal(filas[0].monto_real, 12000);
  });
  it("suma solo el reembolso Verificación y Despacho, sin alterar las filas de Finanzas", () => {
    const gastos = [
      { concepto: "Gastos de Verificación y Despacho", monto: 1500, es_reembolso: true },
      { concepto: "Gastos de Verificación y Despacho", monto: 400, es_reembolso: false },
      { concepto: "Honorarios de terceros", monto: 2500, es_reembolso: true },
      { concepto: "Gastos de Verificación y Despacho", monto: 300, es_reembolso: true, deleted_at: "2026-10-24" },
    ];
    const antes = structuredClone(gastos);
    assert.equal(costosAutomaticosLiquidacion([], gastos)[1].monto_real, 1500);
    assert.deepEqual(gastos, antes);
  });
  it("sin fuentes ambos conceptos valen cero", () => {
    assert.deepEqual(costosAutomaticosLiquidacion().map((f) => f.monto_real), [0, 0]);
  });
  it("ambos costos integran DOP/USD, inversión y costo unitario prorrateado", () => {
    const costos = costosAutomaticosLiquidacion([{ tipo: "terrestre", costo_viaje: 12000 }], [
      { concepto: "Gastos de Verificación y Despacho", monto: 1500, es_reembolso: true },
    ]);
    const gastos = totalCostoMercanciaRd(costos, 0);
    const gastosUsd = (gastos + FORMULARIO_DUA_RD) / 60;
    const list = [{ detalle_producto: "A", valor_fob: 600, cantidad: 6 }, { detalle_producto: "B", valor_fob: 400, cantidad: 4 }];
    const r = calcularResultadosLiquidacion({
      exp: {}, list, gastosAdicionales: gastos, servicioUsd: 0, tasaCambio: 60, costosProducto: costos,
      calcFila: (it) => ({ fob: it.valor_fob, cant: it.cantidad, gr: 0, ir: 0, tr: 0, cv: null,
        est: { gravamen: 0, selectivo: 0, itbis: 0, cifLinea: it.valor_fob },
        costoUnit: costoUnitarioReal(it.valor_fob, 0, 0, gastosUsd, it.valor_fob / 1000, it.cantidad) }),
    });
    assert.equal(r.costosTotal.dop, 13758.26);
    assert.equal(r.componentes.costoMercanciaUsd, 225);
    assert.ok(Math.abs(r.totales.inv - (1000 + 13758.26 / 60)) < 0.000001);
    assert.ok(Math.abs(r.productos[0].c.costoUnit - (100 + 13758.26 / 600)) < 0.000001);
    assert.equal(r.costosMercancia.find((c) => c.concepto === costos[0].concepto)?.usd, 200);
    assert.equal(r.costosMercancia.find((c) => c.concepto === costos[1].concepto)?.usd, 25);
  });
});