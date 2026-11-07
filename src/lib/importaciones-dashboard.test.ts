import { describe, expect, it } from "vitest";
import { normalizarOrden } from "./orden-preferencia";
import {
  KPI_DASH_IMPORTACIONES_IDS, cubetasSerie, periodoComparado, resumenImportaciones, variacionPct,
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

  it("agrupa por fecha de registro en hora de Santo Domingo", () => {
    // 2026-11-01 02:00 UTC = 31 oct 22:00 en Santo Domingo → cuenta en octubre.
    const exps = [{ id: "a", created_at: "2026-11-01T02:00:00Z" }, { id: "b", created_at: "2026-11-03T15:00:00Z" }];
    const fac = new Map([["a", 1000], ["b", 400]]);
    const gas = new Map([["b", 100]]);
    expect(resumenImportaciones(exps, fac, gas, { desde: "2026-11-01", hasta: "2026-11-07" }))
      .toEqual({ cantidad: 1, facturado: 400, gastos: 100, utilidad: 300, margen: 75 });
  });

  it("sin datos en el período anterior la variación es «sin base»", () => {
    expect(variacionPct(5, 0)).toBeNull();
    expect(variacionPct(3, 4)).toBe(-25);
  });

  it("un orden guardado incompleto conserva los cinco recuadros", () => {
    expect(normalizarOrden(["margen", "importaciones"], KPI_DASH_IMPORTACIONES_IDS))
      .toEqual(["margen", "importaciones", "facturado", "gastos", "utilidad"]);
  });
});
