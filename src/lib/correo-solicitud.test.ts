import { describe, expect, it } from "vitest";
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
