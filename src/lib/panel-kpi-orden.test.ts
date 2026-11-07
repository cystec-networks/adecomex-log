import { describe, expect, it } from "vitest";
import { KPI_PANEL_IDS, esOrdenPorDefecto, moverKpi, normalizarOrdenKpi } from "./panel-kpi-orden";

describe("orden de KPI del Panel de operaciones", () => {
  it("sin preferencia guardada usa el orden por defecto con las ocho tarjetas", () => {
    expect(normalizarOrdenKpi(null)).toEqual([...KPI_PANEL_IDS]);
    expect(normalizarOrdenKpi(null)).toHaveLength(8);
  });

  it("respeta el orden guardado por el usuario", () => {
    const guardado = ["alertas", "correos", "pagos-transportista", "logistica", "expedientes-transito", "expedientes-por-llegar", "permisos-vuce", "transportes"];
    expect(normalizarOrdenKpi(guardado)).toEqual(guardado);
  });

  it("descarta ids desconocidos o repetidos y agrega al final las tarjetas que falten", () => {
    expect(normalizarOrdenKpi(["transportes", "inventado", "transportes", "correos"])).toEqual([
      "transportes", "correos", "pagos-transportista", "logistica", "expedientes-transito", "expedientes-por-llegar", "permisos-vuce", "alertas",
    ]);
  });

  it("arrastrar Alertas activas sobre Correos pendientes la deja primera", () => {
    const nuevo = moverKpi([...KPI_PANEL_IDS], "alertas", "correos");
    expect(nuevo[0]).toBe("alertas");
    expect(nuevo[1]).toBe("correos");
    expect(nuevo).toHaveLength(8);
    expect(esOrdenPorDefecto(nuevo)).toBe(false);
  });

  it("arrastrar hacia la derecha coloca la tarjeta en la posición de destino", () => {
    const nuevo = moverKpi([...KPI_PANEL_IDS], "correos", "logistica");
    expect(nuevo.slice(0, 3)).toEqual(["pagos-transportista", "logistica", "correos"]);
  });
});
