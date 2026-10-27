import { describe, it } from "node:test";
import assert from "node:assert/strict";
function expect(actual: unknown) {
  return {
    toBe: (v: unknown) => assert.equal(actual, v),
    toBeNull: () => assert.equal(actual, null),
    toEqual: (v: unknown) => assert.deepEqual(actual, v),
    not: { toContain: (v: string) => assert.ok(!String(actual).includes(v)) },
  };
}
import { aislarMensajeReciente, combinarDatos, extraerPorEtiquetas, camposFaltantes } from "./correo-solicitud";

const CORREO = `Favor proceder con el trámite de VUCE para la siguiente carga:
- BL: HLCULI2260908636
- ETA: 26/01/2026
- Producto: LECHE DESCREMADA LACTOGAL - VHUMANA
- Cantidad: 50MT

Saludos

---------- Forwarded message ---------
De: Otro <otro@x.com>
- BL: MSCU9999999
- Producto: QUESO
El lun, 5 ene 2026 a las 10:00, Juan escribió:
> - Cantidad: 99MT`;

describe("correo de solicitud", () => {
  it("procesa solo el mensaje nuevo con sus 4 datos", () => {
    const m = aislarMensajeReciente(CORREO);
    expect(m).not.toContain("MSCU9999999");
    expect(m).not.toContain("99MT");
    expect(extraerPorEtiquetas(m)).toEqual({
      bl_awb: "HLCULI2260908636", eta: "2026-01-26",
      producto: "LECHE DESCREMADA LACTOGAL - VHUMANA", cantidad: "50MT", cliente_nombre: null,
    });
  });
  it("corta en De:/Enviado: y From:/Sent:", () => {
    expect(aislarMensajeReciente("Hola\nDe: A\nEnviado: hoy\nviejo")).toBe("Hola");
    expect(aislarMensajeReciente("Hi\nFrom: A\nSent: today\nold")).toBe("Hi");
  });
  it("rechaza valores de IA que no están en el texto", () => {
    const d = combinarDatos(extraerPorEtiquetas("Necesito despacho de arroz"), { bl_awb: "INVENTADO123", producto: "arroz" }, "Necesito despacho de arroz");
    expect(d.bl_awb).toBeNull();
    expect(d.producto).toBe("arroz");
  });
  it("indica campos faltantes", () => {
    expect(camposFaltantes({ bl_awb: "X", eta: null, producto: "p", cantidad: null, cliente_nombre: null })).toEqual(["ETA", "Cantidad", "Cliente"]);
  });
});

import { extraerDeAsunto, fusionarAsunto } from "./correo-solicitud";
describe("asunto del correo", () => {
  it("lee BL y ETA del patrón HACER VUCE", () => {
    expect(extraerDeAsunto("HACER VUCE: BL MEDUAFV97440--ETA 26/10/2026---- DRAFT DOCS")).toEqual({ bl_awb: "MEDUAFV97440", eta: "2026-10-26" });
    expect(extraerDeAsunto("REGISTRO #202608I312 : HACER VUCE: BL MEDURT657984-- ETA 29/09/2026 -- x")).toEqual({ bl_awb: "MEDURT657984", eta: "2026-09-29" });
    expect(extraerDeAsunto("REGISTRO #202608I312 : HACER VUCE - BL: MEDURT657984 ---29/09/2026---FDP")).toEqual({ bl_awb: "MEDURT657984", eta: "2026-09-29" });
  });
  it("sin patrón no inventa", () => {
    expect(extraerDeAsunto("HACER VUCE Fwd: PROFORMA 2 CEBOLLA ROJA")).toEqual({ bl_awb: null, eta: null });
  });
  it("el cuerpo gana con advertencia si difiere", () => {
    const base = { bl_awb: "AAA111222", eta: "2026-10-01", producto: null, cantidad: null, cliente_nombre: null };
    const r = fusionarAsunto(base, "HACER VUCE: BL MEDUAFV97440--ETA 26/10/2026--");
    expect(r.datos.bl_awb).toBe("AAA111222");
    expect(r.datos.eta).toBe("2026-10-01");
    expect(r.advertencias.length).toBe(2);
    const v = fusionarAsunto({ ...base, bl_awb: null, eta: null }, "HACER VUCE: BL MEDUAFV97440--ETA 26/10/2026--");
    expect(v.datos.bl_awb).toBe("MEDUAFV97440");
    expect(v.advertencias.length).toBe(0);
  });
});
