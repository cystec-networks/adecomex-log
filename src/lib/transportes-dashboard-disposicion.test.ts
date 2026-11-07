import { describe, expect, it } from "vitest";
import { moverEnOrden, normalizarOrden } from "./orden-preferencia";
import {
  BLOQUES_DASH_TRANSPORTES_IDS, ESTADOS_DASH_TRANSPORTES_IDS, KPI_DASH_TRANSPORTES_IDS, ordenarPorClave,
} from "./transportes-dashboard-disposicion";
import { ESTADOS_DASHBOARD } from "./transportes-dashboard";

describe("disposición del Dashboard de Transportes", () => {
  it("los ids de estados coinciden con los estados del dashboard", () => {
    expect([...ESTADOS_DASH_TRANSPORTES_IDS]).toEqual(ESTADOS_DASHBOARD.map((e) => e.key));
  });

  it("un orden guardado incompleto conserva todos los KPI", () => {
    expect(normalizarOrden(["margen", "desconocido", "viajes"], KPI_DASH_TRANSPORTES_IDS))
      .toEqual(["margen", "viajes", "contenedores", "ingreso"]);
  });

  it("mover Rentabilidad sobre Contenedores la deja primero", () => {
    expect(moverEnOrden([...BLOQUES_DASH_TRANSPORTES_IDS], "rentabilidad", "contenedores"))
      .toEqual(["rentabilidad", "contenedores"]);
  });

  it("los estados (y la gráfica) siguen el orden elegido", () => {
    const orden = ["facturado", "programado", "en_transito", "retrasado", "entregado"];
    expect(ordenarPorClave(ESTADOS_DASHBOARD, orden).map((e) => e.key)).toEqual(orden);
  });
});
