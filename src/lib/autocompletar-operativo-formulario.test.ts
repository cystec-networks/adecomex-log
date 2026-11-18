import { describe, expect, it } from "vitest";
import { camposAplicadosParaFormulario, valorVacio } from "./autocompletar-operativo-formulario";

describe("camposAplicadosParaFormulario", () => {
  it("lleva a la ficha abierta el BL y Otros aplicados cuando estaban vacíos", () => {
    const form = { bl_awb: "", otros: "", naviera: "CMA CGM" };
    const guardado = { bl_awb: "ANT2054698", otros: 800, naviera: "CMA CGM" };
    expect(camposAplicadosParaFormulario(form, null, guardado, ["bl_awb", "otros"]))
      .toEqual({ bl_awb: "ANT2054698", otros: 800 });
  });

  it("respeta lo escrito y no guardado en una casilla que estaba vacía", () => {
    const abierto = { bl_awb: "" };
    const form = { bl_awb: "MIBL123" };
    expect(camposAplicadosParaFormulario(form, abierto, { bl_awb: "ANT2054698" }, ["bl_awb"])).toEqual({});
  });

  it("cero cuenta como vacío", () => {
    expect(valorVacio(0)).toBe(true);
    expect(valorVacio("0.00")).toBe(true);
    expect(camposAplicadosParaFormulario({ otros: 0 }, { otros: 5 }, { otros: 800 }, ["otros"])).toEqual({ otros: 800 });
  });

  it("no toca campos que no se completaron", () => {
    const form = { bl_awb: "", naviera: "" };
    expect(camposAplicadosParaFormulario(form, null, { bl_awb: "X", naviera: "MSC" }, ["bl_awb"])).toEqual({ bl_awb: "X" });
  });
});
