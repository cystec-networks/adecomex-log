import { describe, expect, it } from "vitest";
import {
  COLUMNAS_ALERTAS,
  GRUPOS_ALERTAS_IDS,
  columnasVisibles,
  disposicionAutomatica,
  disposicionEfectiva,
  moverGrupoAlertas,
  normalizarDisposicionAlertas,
  type DisposicionAlertas,
} from "./panel-alertas-disposicion";

const todos = (d: DisposicionAlertas) => [...d[0], ...d[1]].sort();

describe("disposición de Atención requerida", () => {
  it("sin preferencia guardada usa el reparto automático balanceado", () => {
    expect(normalizarDisposicionAlertas(null)).toBeNull();
    const conteos = { eta: 10, mora: 4, transportes: 3, hitos: 2 };
    const visibles = columnasVisibles(disposicionEfectiva(null, conteos), conteos);
    expect(visibles[0]).toEqual(["eta"]);
    expect(visibles[1]).toEqual(["hitos", "mora", "transportes"]);
  });

  it("la disposición siempre incluye los doce bloques una sola vez", () => {
    expect(todos(disposicionAutomatica({ eta: 1 }))).toEqual([...GRUPOS_ALERTAS_IDS].sort());
  });

  it("respeta la disposición guardada, descarta ids desconocidos o repetidos y agrega los bloques nuevos", () => {
    const d = normalizarDisposicionAlertas({ columnas: [["mora", "inventado", "eta"], ["eta", "plazo"]] })!;
    expect(d[0].slice(0, 2)).toEqual(["mora", "eta"]);
    expect(d[1][0]).toBe("plazo");
    expect(todos(d)).toEqual([...GRUPOS_ALERTAS_IDS].sort());
  });

  it("mueve un bloque de la columna izquierda a la derecha, sobre otro bloque", () => {
    const base: DisposicionAlertas = [["eta", "mora"], ["hitos", "plazo"]];
    expect(moverGrupoAlertas(base, "mora", "plazo")).toEqual([["eta"], ["hitos", "mora", "plazo"]]);
  });

  it("al cruzar de columna con el puntero bajo la mitad del destino, queda debajo de él", () => {
    const base: DisposicionAlertas = [["eta", "mora"], ["hitos", "plazo"]];
    expect(moverGrupoAlertas(base, "mora", "plazo", true)).toEqual([["eta"], ["hitos", "plazo", "mora"]]);
  });

  it("soltar sobre una columna deja el bloque al final de esa columna", () => {
    const base: DisposicionAlertas = [["eta", "mora"], ["hitos"]];
    expect(moverGrupoAlertas(base, "eta", COLUMNAS_ALERTAS[1])).toEqual([["mora"], ["hitos", "eta"]]);
  });

  it("reordena dentro de la misma columna tomando la posición del destino", () => {
    const base: DisposicionAlertas = [["eta", "mora", "pin"], []];
    expect(moverGrupoAlertas(base, "eta", "pin")[0]).toEqual(["mora", "pin", "eta"]);
    expect(moverGrupoAlertas(base, "pin", "eta")[0]).toEqual(["pin", "eta", "mora"]);
  });

  it("con la disposición guardada, un bloque sin alertas no aparece pero conserva su lugar", () => {
    const guardada: DisposicionAlertas = [["plazo", "mora"], ["eta"]];
    const visibles = columnasVisibles(guardada, { mora: 1, eta: 2 });
    expect(visibles).toEqual([["mora"], ["eta"]]);
  });
});
