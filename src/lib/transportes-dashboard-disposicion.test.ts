import { describe, expect, it } from "vitest";
import { moverEnOrden, normalizarOrden } from "./orden-preferencia";
import {
  BLOQUES_DASH_TRANSPORTES_AL_INICIO, BLOQUES_DASH_TRANSPORTES_IDS, ESTADOS_DASH_TRANSPORTES_IDS, KPI_DASH_TRANSPORTES_IDS, ordenarPorClave,
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

  it("mover Rentabilidad sobre Estados la deja primero", () => {
    expect(moverEnOrden([...BLOQUES_DASH_TRANSPORTES_IDS], "rentabilidad", "estados"))
      .toEqual(["rentabilidad", "estados", "contenedores"]);
  });

  it("Estados es un bloque movible y por defecto va primero", () => {
    expect(normalizarOrden(null, BLOQUES_DASH_TRANSPORTES_IDS, BLOQUES_DASH_TRANSPORTES_AL_INICIO))
      .toEqual(["estados", "contenedores", "rentabilidad"]);
  });

  it("un orden guardado antes de existir el bloque Estados lo conserva arriba", () => {
    expect(normalizarOrden(["rentabilidad", "contenedores"], BLOQUES_DASH_TRANSPORTES_IDS, BLOQUES_DASH_TRANSPORTES_AL_INICIO))
      .toEqual(["estados", "rentabilidad", "contenedores"]);
  });

  it("un orden guardado con Estados abajo se respeta", () => {
    expect(normalizarOrden(["contenedores", "rentabilidad", "estados"], BLOQUES_DASH_TRANSPORTES_IDS, BLOQUES_DASH_TRANSPORTES_AL_INICIO))
      .toEqual(["contenedores", "rentabilidad", "estados"]);
  });

  it("los estados (y la gráfica) siguen el orden elegido", () => {
    const orden = ["facturado", "programado", "en_transito", "retrasado", "entregado"];
    expect(ordenarPorClave(ESTADOS_DASHBOARD, orden).map((e) => e.key)).toEqual(orden);
  });
});
