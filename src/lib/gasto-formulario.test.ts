import { describe, expect, it } from "vitest";
import { reembolsoPorConcepto, tieneDatosFiscales } from "./gasto-formulario";

const catalogo = [
  { nombre: "Honorarios de terceros", es_reembolso_defecto: false },
  { nombre: "Reembolsos", es_reembolso_defecto: true },
];

describe("reembolsoPorConcepto", () => {
  it("Honorarios de terceros viene en No aunque el interruptor estuviera marcado", () => {
    expect(reembolsoPorConcepto("Honorarios de terceros", catalogo, true)).toBe(false);
  });
  it("un concepto con «Es reembolso por defecto» en Sí marca el interruptor", () => {
    expect(reembolsoPorConcepto("Reembolsos", catalogo, false)).toBe(true);
  });
  it("un concepto escrito a mano conserva el valor actual", () => {
    expect(reembolsoPorConcepto("Otro gasto", catalogo, true)).toBe(true);
    expect(reembolsoPorConcepto("Otro gasto", catalogo, false)).toBe(false);
  });
});

describe("tieneDatosFiscales", () => {
  it("abre el bloque fiscal con RNC o NCF guardados", () => {
    expect(tieneDatosFiscales({ rnc_cedula_proveedor: "101010101", ncf_proveedor: "" })).toBe(true);
    expect(tieneDatosFiscales({ rnc_cedula_proveedor: "", ncf_proveedor: "B0100000001" })).toBe(true);
  });
  it("sin RNC ni NCF queda colapsado", () => {
    expect(tieneDatosFiscales({ rnc_cedula_proveedor: " ", ncf_proveedor: null })).toBe(false);
  });
});
