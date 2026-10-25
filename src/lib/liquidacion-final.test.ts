import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularResultadosLiquidacion, valorRealInicial, type FilaCalc } from "./liquidacion-final";

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

const EST = { gravamen: 250.128, selectivo: 45.004, itbis: 54.017 };

describe("valorRealInicial — precarga de Grav./ISC/ITBIS Real", () => {
  it("sin valor guardado, cada campo Real arranca con su columna Est redondeada a centavos", () => {
    assert.equal(valorRealInicial("gravamen_real", null, EST), "250.13");
    assert.equal(valorRealInicial("isc_real", null, EST), "45");
    assert.equal(valorRealInicial("itbis_real", null, EST), "54.02");
  });

  it("la precarga deja la columna Dif. en 0.00", () => {
    const pares = [
      ["gravamen_real", "gravamen"],
      ["isc_real", "selectivo"],
      ["itbis_real", "itbis"],
    ] as const;
    for (const [campo, clave] of pares) {
      const v = Number(valorRealInicial(campo, null, EST));
      const d = Number((v - EST[clave]).toFixed(2)) || 0; // misma normalización que la columna Dif.
      assert.equal(d, 0);
    }
  });

  it("un monto ya guardado (incluido 0) no se sobrescribe", () => {
    assert.equal(valorRealInicial("gravamen_real", 0, EST), null);
    assert.equal(valorRealInicial("gravamen_real", 300, EST), null);
    assert.equal(valorRealInicial("itbis_real", "18", EST), null);
  });

  it("Costo de Venta no se precarga nunca", () => {
    assert.equal(valorRealInicial("costo_venta_unitario", null, EST), null);
  });
});

import { precioVentaPorGanancia, margenSobreVenta, aplicarGananciaTodos, gananciaComunGuardada } from "./liquidacion-final";

describe("% de ganancia sobre costo", () => {
  it("30% sobre 4.2641 da 5.5433 y el margen sobre venta no es 30%", () => {
    const pv = precioVentaPorGanancia(4.2641, 30)!;
    assert.equal(pv, 5.5433);
    const m = margenSobreVenta(4.2641, pv)!;
    assert.ok(Math.abs(m - 23.077) < 0.01);
  });
  it("sin % no calcula precio", () => {
    assert.equal(precioVentaPorGanancia(4, null), null);
  });
});

describe("markup común multiproducto", () => {
  it("30% actualiza las tres filas en un único borrador preservando sus impuestos", () => {
    const draft = aplicarGananciaTodos({ a: { gravamen_real: "15" } }, ["a", "b", "c"], "30");
    assert.equal(draft.a.gravamen_real, "15");
    for (const id of ["a", "b", "c"]) assert.deepEqual([draft[id].modo_venta, draft[id].pct_ganancia_venta, draft[id].cv_auto], ["pct", "30", "1"]);
    assert.equal(gananciaComunGuardada([{ pct_ganancia_venta: null }, {}, { pct_ganancia_venta: 30 }]), 30);
  });
  it("cada costo propio × 1.30 y cantidades generan margen combinado 23.0769%, no −170.1%", () => {
    const filas = [{ costo: 4, cant: 2000 }, { costo: 8, cant: 600 }, { costo: 5, cant: 1000 }];
    const r = calcularResultadosLiquidacion({ ...base, list: filas, costosProducto: [], calcFila: it => ({ ...calcFila(), cant: it.cant, costoUnit: it.costo, cv: precioVentaPorGanancia(it.costo, 30) }) });
    assert.deepEqual(r.productos.map(p => p.c.cv), [5.2, 10.4, 6.5]);
    assert.equal(r.totales.inv, 17800);
    assert.equal(r.totales.venta, 23140);
    assert.equal(r.margenTotal, 5340);
    assert.ok(Math.abs(r.margenPct - 23.0769230769) < 0.0001);
  });
  it("ajuste directo de una fila solo cambia su precio y mantiene total ponderado", () => {
    const draft = aplicarGananciaTodos({}, ["a", "b", "c"], "30");
    draft.b = { ...draft.b, modo_venta: "directo", costo_venta_unitario: "12", cv_auto: "" };
    assert.equal(draft.a.pct_ganancia_venta, "30");
    assert.equal(draft.c.pct_ganancia_venta, "30");
    assert.equal(draft.b.costo_venta_unitario, "12");
    const nuevos = aplicarGananciaTodos(draft, ["a", "b", "c"], "25");
    assert.equal(nuevos.b.cv_auto, "1");
    assert.equal(precioVentaPorGanancia(8, Number(nuevos.b.pct_ganancia_venta)), 10);
  });
});
