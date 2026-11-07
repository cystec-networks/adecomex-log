import { describe, expect, it } from "vitest";
import { cobroPorTransporte, contarContenedores, estadoDashboard, fraccionCobrada, resumenTransportes, variacionPct } from "./transportes-dashboard";
import type { GananciaTransporte } from "./transporte-ganancia";

const g = (montoFacturar: number | null, ganancia: number | null, netoPagar: number, moneda = "DOP"): GananciaTransporte =>
  ({ montoFacturar, ganancia, netoPagar, descuentoCxc: 0, moneda, solicitudes: 1 });

describe("Dashboard de Transportes", () => {
  it("cuenta los contenedores escritos en Placa / Contenedor cuando no hay cantidad", () => {
    expect(contarContenedores({ id: "a", placa_contenedor: "CSGU2401467, OOCU5757430, UETU5940015" })).toBe(3);
    expect(contarContenedores({ id: "a", placa_contenedor: "Movimiento de Almacaribe hasta la vega por 25,000" })).toBe(0);
    expect(contarContenedores({ id: "a", placa_contenedor: "CSGU2401467, csgu 240146-7" })).toBe(1);
  });

  it("la cantidad de contenedores a facturar escrita prevalece", () => {
    expect(contarContenedores({ id: "a", contenedores_cantidad: 2, placa_contenedor: "CSGU2401467" })).toBe(2);
  });

  it("un viaje entregado con factura e-CF vinculada cuenta como Facturado", () => {
    expect(estadoDashboard({ id: "a", estado: "entregado" }, new Set(["a"]))).toBe("facturado");
    expect(estadoDashboard({ id: "b", estado: "entregado", factura_ecf_id: "x" }, new Set())).toBe("facturado");
    expect(estadoDashboard({ id: "c", estado: "facturado" }, new Set())).toBe("facturado");
    expect(estadoDashboard({ id: "d", estado: "entregado" }, new Set())).toBe("entregado");
  });

  it("el ingreso es el Monto a Facturar al Cliente, no el Monto Neto a Pagar", () => {
    const r = resumenTransportes(
      [{ id: "tr67", pago_estado: "pendiente" }],
      new Map([["tr67", g(80000, 6400, 71100)]]),
    );
    expect(r.ingreso).toBe(80000);
    expect(r.ganancia).toBe(6400);
    expect(r.costo).toBe(73600);
    expect(r.netoPagar).toBe(71100);
    expect(r.margenPct).toBeCloseTo(8, 5);
    expect(r.pendienteCobro).toBe(80000);
  });

  it("Pendiente de cobro resta lo ya cobrado de las facturas e-CF vinculadas", () => {
    const viajes = [
      { id: "pagado", facturas: [{ id: "f1", monto_total: 16037.74, cxc_pagos: [{ monto: 16037.74 }] }] },
      { id: "sin-cobro", facturas: [{ id: "f2", monto_total: 15000, cxc_pagos: [] }] },
      { id: "sin-factura" },
    ];
    const r = resumenTransportes(viajes, new Map([
      ["pagado", g(14000, 1000, 13000)], ["sin-cobro", g(15000, 1000, 14000)], ["sin-factura", g(20000, 1000, 19000)],
    ]), cobroPorTransporte(viajes));
    expect(r.ingreso).toBe(49000);
    expect(r.cobrado).toBe(14000);
    expect(r.pendienteCobro).toBe(35000);
  });

  it("un cobro parcial reduce el pendiente en la misma proporción", () => {
    expect(fraccionCobrada("t", [{ id: "f", monto_total: 20000, cxc_pagos: [{ monto: 5000 }] }])).toBe(0.25);
    const r = resumenTransportes([{ id: "t" }], new Map([["t", g(18000, 0, 18000)]]), new Map([["t", 0.25]]));
    expect(r.pendienteCobro).toBe(13500);
  });

  it("facturas anuladas no cuentan como cobradas y las de varias líneas pesan solo su parte", () => {
    expect(fraccionCobrada("t", [{ id: "a", monto_total: 10000, estado: "anulada", cxc_pagos: [{ monto: 10000 }] }])).toBe(0);
    const mixta = { id: "m", monto_total: 30000, vinculo_por_linea: true, cxc_pagos: [{ monto: 30000 }],
      facturas_ecf_lineas: [{ transporte_id: "t", valor: 10000, itbis: 0 }, { transporte_id: null, valor: 20000, itbis: 0 }] };
    const pendiente = { id: "p", monto_total: 10000, cxc_pagos: [] };
    expect(fraccionCobrada("t", [mixta, pendiente])).toBe(0.5);
  });

  it("un transporte marcado Pagado cuenta como cobrado completo", () => {
    expect(cobroPorTransporte([{ id: "t", pago_estado: "pagado" }]).get("t")).toBe(1);
  });

  it("variación contra el período anterior; sin base devuelve null", () => {
    expect(variacionPct(4, 1)).toBe(300);
    expect(variacionPct(293000, 28000)).toBeCloseTo(946.43, 2);
    expect(variacionPct(5, 0)).toBeNull();
  });
});
