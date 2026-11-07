import { describe, expect, it } from "vitest";
import { contarContenedores, estadoDashboard, resumenTransportes, variacionPct } from "./transportes-dashboard";
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

  it("variación contra el período anterior; sin base devuelve null", () => {
    expect(variacionPct(4, 1)).toBe(300);
    expect(variacionPct(293000, 28000)).toBeCloseTo(946.43, 2);
    expect(variacionPct(5, 0)).toBeNull();
  });
});
