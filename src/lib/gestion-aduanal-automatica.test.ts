import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolverCostosGestion, type CobroGestion } from "./gestion-aduanal-automatica";
import { costoUnitarioReal } from "./liquidacion-final";

const fuente = (): CobroGestion => ({ concepto: "Servicios de gestión aduanal (gravado)",
  facturas_ecf: { id: "ecf354", encf: "E310000000354", monto_total: 8850, subtotal_gravado: 7500, subtotal_exento: 0, pdf_url: "factura.pdf", estado: "emitida" } });
describe("Gestión Aduanal automática desde Finanzas", () => {
  it("genera Precio RD$7,500 sin ITBIS RD$1,350 de E310000000354 con PDF", () => {
    const filas = resolverCostosGestion([], [fuente()]);
    assert.equal(filas.length, 1); assert.equal(filas[0].monto_real, 7500);
    assert.equal(filas[0].moneda, "DOP"); assert.equal(filas[0].automatico, true);
  });
  it("sin PDF no genera costo", () => {
    const cobro = fuente(); if (cobro.facturas_ecf) cobro.facturas_ecf.pdf_url = "  ";
    assert.equal(resolverCostosGestion([], [cobro]).length, 0);
  });
  it("actualizar el monto de e-CF actualiza una sola línea", () => {
    const cobro = fuente(); if (cobro.facturas_ecf) cobro.facturas_ecf.subtotal_gravado = 9000;
    const filas = resolverCostosGestion([], [cobro, cobro]);
    assert.equal(filas.length, 1); assert.equal(filas[0].monto_real, 9000);
  });
  it("eliminar o anular e-CF retira costo y su contraparte escaneada", () => {
    for (const patch of [{ eliminado_en: "2026-10-25" }, { estado: "anulada" }, { pdf_url: null }]) {
      const cobro = fuente(); if (cobro.facturas_ecf) Object.assign(cobro.facturas_ecf, patch);
      const costos = [{ id: "scan", concepto: "Gestión Aduanal", moneda: "DOP", monto_real: 8850,
        observaciones: "Factura/NCF: E310000000354 · Pago escaneado: Gestión Aduanal" }];
      assert.equal(resolverCostosGestion(costos, [cobro]).length, 0);
    }
  });
  it("borrar el cobro de Gestión retira su costo", () => {
    const cobro = fuente(); cobro.deleted_at = "2026-10-25";
    assert.equal(resolverCostosGestion([], [cobro]).length, 0);
  });
  it("no duplica escaneo de la misma factura ni cambia costos independientes", () => {
    const costos = [
      { id: "scan", concepto: "Gestión Aduanal", moneda: "DOP", monto_real: 8850, observaciones: "Factura/NCF: E310000000354 · Pago escaneado: Gestión Aduanal" },
      { id: "otro", concepto: "Gestión Aduanal", moneda: "DOP", monto_real: 100, observaciones: "Factura/NCF: OTRA" },
      { id: "alm", concepto: "Almacenaje", moneda: "DOP", monto_real: 2500 },
    ];
    const antes = structuredClone(costos); const cobro = fuente(); const original = structuredClone(cobro);
    const filas = resolverCostosGestion(costos, [cobro]);
    assert.equal(filas.length, 3); assert.equal(filas.reduce((s, c) => s + Number(c.monto_real), 0), 10100);
    assert.deepEqual(costos, antes); assert.deepEqual(cobro, original);
  });
  it("no convierte una factura de Transporte en Gestión Aduanal", () => {
    const cobro = fuente(); cobro.concepto = "Servicios de Transportes (exentos)";
    assert.equal(resolverCostosGestion([], [cobro]).length, 0);
  });
  it("incluye RD$7,500 sin ITBIS en el costo unitario con tasa 61.7717", () => {
    const filas = resolverCostosGestion([], [fuente()]);
    const gastosUsd = Number(filas[0].monto_real) / 61.7717;
    const con = costoUnitarioReal(1000, 0, 0, gastosUsd, 1, 100);
    const sin = costoUnitarioReal(1000, 0, 0, 0, 1, 100);
    assert.ok(Math.abs((con - sin) - 7500 / 61.7717 / 100) < 1e-10);
  });
});
it("Precio incluye subtotal exento y no vuelve al total si la base es cero", () => {
  const cobro = fuente();
  if (!cobro.facturas_ecf) throw new Error("falta factura");
  cobro.facturas_ecf.subtotal_exento = 500;
  assert.equal(resolverCostosGestion([], [cobro])[0].monto_real, 8000);
  cobro.facturas_ecf.subtotal_gravado = 0; cobro.facturas_ecf.subtotal_exento = 0;
  assert.equal(resolverCostosGestion([], [cobro])[0].monto_real, 0);
});
