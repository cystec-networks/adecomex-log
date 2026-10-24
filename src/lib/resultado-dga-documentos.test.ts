import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { camposDesdeDocumentoDga, completarResultadoDga } from "./resultado-dga-documentos";
describe("Resultado DGA acumulativo", () => {
  it("Liquidación aporta número y estado, nunca total de impuestos", () => {
    assert.deepEqual(camposDesdeDocumentoDga("Reporte de Liquidación de Impuestos", { numero: "10150-CL11-2610-001CBA", estado: "Registrado/Aceptado", total: 1654000 }), { liq_siga_numero: "10150-CL11-2610-001CBA", liq_siga_estado: "Registrado/Aceptado" });
  });
  it("PIN aporta monto completo, ID y fechas RD", () => {
    assert.deepEqual(camposDesdeDocumentoDga("PIN de Pago de Impuestos", { pin: "20261013B7769123", registro: "2026-10-13", termino: "2026-10-17", total: 1654816.35 }), { liq_oficial_total: 1654816.35, liq_siga_pin_pago: "20261013B7769123", liq_siga_registro_at: "2026-10-13T00:00:00-04:00", liq_siga_fecha_registro: "2026-10-13", liq_siga_termino_at: "2026-10-17T00:00:00-04:00" });
  });
  it("Recibo completa fecha y total solo vacíos sin afectar PIN", () => {
    const campos = camposDesdeDocumentoDga("Recibo Pago de Impuestos", { fecha_pago: "2026-10-14", total: 1654816.35, pin: "otro" });
    assert.deepEqual(completarResultadoDga({ liq_oficial_total: 1654816.35, liq_siga_pin_pago: "20261013B7769123" }, campos), { liq_siga_fecha_pago: "2026-10-14" });
    assert.equal(completarResultadoDga({}, campos).liq_oficial_total, 1654816.35);
  });
  it("preserva cualquier valor manual incluido cero y permite acumulación en cualquier orden", () => {
    assert.deepEqual(completarResultadoDga({ liq_oficial_total: 0, liq_siga_estado: "Manual" }, { liq_oficial_total: 1654816.35, liq_siga_estado: "Registrado/Aceptado" }), {});
    let actual = {};
    for (const [tipo, data] of [["Recibo Pago de Impuestos", { total: 1654816.35, fecha_pago: "2026-10-14" }], ["PIN de Pago de Impuestos", { pin: "20261013B7769123", registro: "2026-10-13", termino: "2026-10-17", total: 1654816.35 }], ["Reporte de Liquidación de Impuestos", { numero: "10150-CL11-2610-001CBA", estado: "Registrado/Aceptado" }]] as const) actual = { ...actual, ...completarResultadoDga(actual, camposDesdeDocumentoDga(tipo, data)) };
    assert.equal(Object.keys(actual).length, 8);
    assert.equal((actual as Record<string, unknown>).liq_oficial_total, 1654816.35);
  });
  it("rechaza fechas inexistentes y conserva horas documentales", () => {
    assert.deepEqual(camposDesdeDocumentoDga("PIN de Pago de Impuestos", { registro: "2026-02-30", total: null }), {});
    assert.equal(camposDesdeDocumentoDga("PIN de Pago de Impuestos", { registro: "2026-10-13T15:42:03" }).liq_siga_registro_at, "2026-10-13T15:42:03-04:00");
  });
});