import { describe, expect, it } from "vitest";
import {
  desgloseSolicitudPago,
  fechaViajePeriodo,
  gananciaPorTransporte,
  rangoPeriodo,
  totalesGananciaPorMoneda,
} from "./transporte-ganancia";

describe("ganancia del viaje (igual que el comprobante)", () => {
  it("RD$80,000.00 − RD$73,600.00 = RD$6,400.00 y descuento CxC 2,500", () => {
    const d = desgloseSolicitudPago({ cantidad_viajes: 5, precio_viaje: 16000, porcentaje_margen: 8, monto: 80000, descuento_cxc: 2500 });
    expect(d.montoFacturar).toBe(80000);
    expect(d.costoViaje).toBe(73600);
    expect(d.ganancia).toBe(6400);
    expect(d.descuentoCxc).toBe(2500);
    expect(d.netoPagar).toBe(71100);
  });

  it("sin cantidad/precio no hay ganancia calculable", () => {
    expect(desgloseSolicitudPago({ monto: 15000 }).ganancia).toBeNull();
  });
});

describe("asignación de solicitudes a viajes", () => {
  it("transporte_id de la solicitud prevalece sobre solicitud_pago_id del viaje", () => {
    const m = gananciaPorTransporte(
      [
        { id: "A", solicitud_pago_id: "s1", created_at: "2026-09-01" },
        { id: "B", solicitud_pago_id: null, created_at: "2026-09-02" },
      ],
      [{ id: "s1", transporte_id: "B", cantidad_viajes: 1, precio_viaje: 10000, porcentaje_margen: 10, descuento_cxc: 500, moneda: "DOP" }],
    );
    expect(m.get("A")).toBeUndefined();
    expect(m.get("B")?.ganancia).toBe(1000);
    expect(m.get("B")?.descuentoCxc).toBe(500);
  });

  it("varias solicitudes de un viaje se suman y las anuladas no cuentan", () => {
    const m = gananciaPorTransporte(
      [{ id: "A" }],
      [
        { id: "s1", transporte_id: "A", cantidad_viajes: 5, precio_viaje: 16000, porcentaje_margen: 8, descuento_cxc: 2500, moneda: "DOP" },
        { id: "s2", transporte_id: "A", cantidad_viajes: 3, precio_viaje: 16000, porcentaje_margen: 8, descuento_cxc: 1500, moneda: "DOP" },
        { id: "s3", transporte_id: "A", estado: "anulada", cantidad_viajes: 9, precio_viaje: 99999, porcentaje_margen: 50, descuento_cxc: 9999, moneda: "DOP" },
      ],
    );
    expect(m.get("A")?.ganancia).toBe(10240);
    expect(m.get("A")?.descuentoCxc).toBe(4000);
    const tot = totalesGananciaPorMoneda(m.values());
    expect(tot.get("DOP")).toEqual({ ganancia: 10240, descuentoCxc: 4000 });
  });
});

describe("período", () => {
  it("semana de lunes a domingo, mes y año", () => {
    expect(rangoPeriodo("semana", new Date(2026, 10, 7))).toEqual({ desde: "2026-11-02", hasta: "2026-11-08" });
    expect(rangoPeriodo("mes", new Date(2026, 1, 10))).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoPeriodo("anio", new Date(2026, 5, 1))).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
    expect(rangoPeriodo("todo", new Date())).toBeNull();
  });

  it("usa la fecha de salida; sin ella, la creación en hora de Santo Domingo", () => {
    expect(fechaViajePeriodo({ fecha_salida: "2026-11-06", created_at: "2026-11-07T12:00:00Z" })).toBe("2026-11-06");
    expect(fechaViajePeriodo({ created_at: "2026-11-08T02:00:00Z" })).toBe("2026-11-07");
  });
});
