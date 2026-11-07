import { describe, expect, it } from "vitest";
import { normalizarOrden } from "./orden-preferencia";
import {
  BLOQUES_DASH_IMPORTACIONES_IDS, KPI_DASH_IMPORTACIONES_IDS, cubetasSerie, fechaMovimiento, pendientesDeLlegada,
  periodoComparado, resumenImportaciones, variacionPct,
} from "./importaciones-dashboard";

describe("Dashboard General · Importaciones", () => {
  it("mes en curso: 1–7 nov se compara con 1–7 oct, no con octubre completo", () => {
    expect(periodoComparado("mensual", "2026-11-07", "2026-11-07")).toEqual({
      actual: { desde: "2026-11-01", hasta: "2026-11-07" },
      previo: { desde: "2026-10-01", hasta: "2026-10-07" },
      aLaFecha: true,
    });
  });

  it("mes cerrado: octubre completo contra septiembre completo", () => {
    expect(periodoComparado("mensual", "2026-10-15", "2026-11-07")).toEqual({
      actual: { desde: "2026-10-01", hasta: "2026-10-31" },
      previo: { desde: "2026-09-01", hasta: "2026-09-30" },
      aLaFecha: false,
    });
  });

  it("31 de marzo se compara con todo febrero (mes más corto)", () => {
    expect(periodoComparado("mensual", "2027-03-31", "2027-03-30").previo).toEqual({ desde: "2027-02-01", hasta: "2027-02-28" });
  });

  it("semana en curso: lunes–sábado contra lunes–sábado de la semana anterior", () => {
    const r = periodoComparado("semanal", "2026-11-07", "2026-11-07");
    expect(r.actual).toEqual({ desde: "2026-11-02", hasta: "2026-11-07" });
    expect(r.previo).toEqual({ desde: "2026-10-26", hasta: "2026-10-31" });
  });

  it("año en curso: 1 ene–7 nov contra 1 ene–7 nov del año anterior", () => {
    expect(periodoComparado("anual", "2026-11-07", "2026-11-07").previo).toEqual({ desde: "2025-01-01", hasta: "2025-11-07" });
  });

  it("vista Anual grafica los 12 meses del año; Mensual los 12 meses hasta el elegido", () => {
    expect(cubetasSerie("anual", "2026-11-07").map((c) => c.rango.desde)[0]).toBe("2026-01-01");
    const m = cubetasSerie("mensual", "2026-11-07");
    expect([m[0].rango.desde, m[11].rango.hasta]).toEqual(["2025-12-01", "2026-11-30"]);
    expect(cubetasSerie("semanal", "2026-11-07")[11].rango).toEqual({ desde: "2026-11-02", hasta: "2026-11-08" });
  });

  it("una importación cuenta en el mes de su Fecha de Llegada Real, no en el de registro", () => {
    const exps = [
      { id: "a", estado: "entregado", fecha_llegada_real: "2026-10-28" },
      { id: "b", estado: "presentar", fecha_llegada_real: "2026-11-03" },
      { id: "c", estado: "en_transito", fecha_llegada_real: null },
    ];
    expect(resumenImportaciones(exps, [], [], { desde: "2026-11-01", hasta: "2026-11-30" }).cantidad).toBe(1);
    expect(resumenImportaciones(exps, [], [], { desde: "2026-10-01", hasta: "2026-10-31" }).cantidad).toBe(1);
  });

  it("sin Fecha de Llegada Real no cuenta: en tránsito o sin fecha según su estado", () => {
    const exps = [
      { id: "a", estado: "en_transito", fecha_llegada_real: null },
      { id: "b", estado: "digitar", fecha_llegada_real: null },
      { id: "c", estado: "entregado", fecha_llegada_real: null },
      { id: "d", estado: "en_transito", fecha_llegada_real: "2026-11-02" },
    ];
    expect(pendientesDeLlegada(exps)).toEqual({ enTransito: 2, sinFecha: 1 });
  });

  it("Facturado y Gastos cuentan por la fecha de cada factura y gasto, no por la llegada", () => {
    const exps = [{ id: "a", estado: "entregado", fecha_llegada_real: "2026-10-28" }];
    const fac = [{ monto: 1000, fecha: "2026-11-05" }, { monto: 500, fecha: "2026-10-30" }];
    const gas = [{ monto: 250, fecha: "2026-11-02" }];
    expect(resumenImportaciones(exps, fac, gas, { desde: "2026-11-01", hasta: "2026-11-30" }))
      .toEqual({ cantidad: 0, facturado: 1000, gastos: 250, utilidad: 750, margen: 75 });
  });

  it("un gasto sin fecha usa el día de su registro en hora de Santo Domingo", () => {
    // 2026-11-01 02:00 UTC = 31 oct 22:00 en Santo Domingo.
    expect(fechaMovimiento(null, "2026-11-01T02:00:00Z")).toBe("2026-10-31");
    expect(fechaMovimiento("2026-11-04", "2026-11-01T02:00:00Z")).toBe("2026-11-04");
  });

  it("sin datos en el período anterior la variación es «sin base»", () => {
    expect(variacionPct(5, 0)).toBeNull();
    expect(variacionPct(3, 4)).toBe(-25);
  });

  it("un orden guardado incompleto conserva los cinco recuadros", () => {
    expect(normalizarOrden(["margen", "importaciones"], KPI_DASH_IMPORTACIONES_IDS))
      .toEqual(["margen", "importaciones", "facturado", "gastos", "utilidad"]);
  });

  it("la fila de KPI y el gráfico de importaciones son bloques movibles; un orden incompleto los conserva todos", () => {
    expect(normalizarOrden(["importaciones", "kpis"], BLOQUES_DASH_IMPORTACIONES_IDS))
      .toEqual(["importaciones", "kpis", "facturado-gastos", "margen", "rankings", "cxc"]);
  });
});
