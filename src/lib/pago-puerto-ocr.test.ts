import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolverPagoPuertoOcr } from "./pago-puerto-ocr";

describe("OCR portuario por etiquetas, independiente del formato", () => {
  it("elige el último total final y nunca subtotales ni cargos intermedios DPH", () => {
    const p = resolverPagoPuertoOcr({ evidencia: { totales: [
      { etiqueta: "TOTAL", monto: 21240, moneda: "DOP", alcance: "intermedio" },
      { etiqueta: "Monto Total", monto: 42480, moneda: "DOP", alcance: "final" },
      { etiqueta: "TOTAL", monto: 100, moneda: "DOP", alcance: "linea" },
      { etiqueta: "Sub Total", monto: 36000, moneda: "DOP", alcance: "final" },
    ] } });
    assert.equal(p.monto, 42480);
  });
  it("usa el último total definitivo, no el mayor ni el primer total", () => {
    assert.equal(resolverPagoPuertoOcr({ evidencia: { totales: [
      { etiqueta: "Total a Pagar", monto: 50000, alcance: "final" },
      { etiqueta: "Total DOP", monto: 34976.95, alcance: "final" },
    ] } }).monto, 34976.95);
  });
  it("moneda del total elegido gana a otro monto y a Bill Currency", () => {
    assert.equal(resolverPagoPuertoOcr({ evidencia: { moneda_factura: "USD", totales: [
      { etiqueta: "TOTAL", monto: 467, moneda: "USD", alcance: "intermedio" },
      { etiqueta: "Total DOP", monto: 34976.95, moneda: "DOP", alcance: "final" },
    ] } }).moneda, "DOP");
  });
  it("sin moneda junto al total usa exclusivamente la moneda global explícita", () => {
    assert.equal(resolverPagoPuertoOcr({ moneda: "USD", evidencia: { moneda_factura: "DOP", totales: [{ etiqueta: "TOTAL", monto: 100, alcance: "final" }] } }).moneda, "DOP");
  });
  it("pago antes de registro, registro antes de factura sin depender del orden", () => {
    const fechas = [
      { etiqueta: "Invoice Date", valor: "2026-10-21" },
      { etiqueta: "Fecha de Registro", valor: "2026-10-22" },
      { etiqueta: "Payment Date", valor: "2026-10-23" },
    ];
    assert.equal(resolverPagoPuertoOcr({ evidencia: { fechas } }).fecha, "2026-10-23");
    assert.equal(resolverPagoPuertoOcr({ evidencia: { fechas: fechas.slice(0, 2) } }).fecha, "2026-10-22");
  });
  it("respaldo Invoice Date/Fecha Decl sin usar vigencia ni vencimiento", () => {
    const fechas = [
      { etiqueta: "Quote Dispatch Valid Until", valor: "2026-10-30" },
      { etiqueta: "Fecha de Vigencia", valor: "2026-10-29" },
      { etiqueta: "Due Date", valor: "2026-10-28" },
      { etiqueta: "Fecha Decl.", valor: "2026-10-24" },
    ];
    assert.equal(resolverPagoPuertoOcr({ evidencia: { fechas } }).fecha, "2026-10-24");
    assert.equal(resolverPagoPuertoOcr({ fecha: "2026-10-30", evidencia: { fechas: fechas.slice(0, 3) } }).fecha, null);
  });
  it("no sustituye evidencia ausente ni último total ilegible por datos adivinados", () => {
    const p = resolverPagoPuertoOcr({ monto: 999, moneda: "DOP", fecha: "2026-10-25", evidencia: { totales: [
      { etiqueta: "TOTAL", monto: 100, alcance: "final" },
      { etiqueta: "Monto Total", monto: null, alcance: "final" },
    ], fechas: [{ etiqueta: "Fecha de Pago", valor: "2026-02-30" }] } });
    assert.equal(p.monto, null); assert.equal(p.moneda, null); assert.equal(p.fecha, null);
  });
  it("PIN SIGA clave-valor reconoce Monto, moneda y Fecha de Registro", () => {
    const p = resolverPagoPuertoOcr({ evidencia: { moneda_factura: "DOP", totales: [{ etiqueta: "Monto", monto: 12345.67, alcance: "final" }], fechas: [{ etiqueta: "Fecha de Registro", valor: "2026-10-23" }] } });
    assert.equal(p.monto, 12345.67); assert.equal(p.moneda, "DOP"); assert.equal(p.fecha, "2026-10-23");
  });
  it("Gestión Aduanal sigue sin ITBIS y con fecha de factura", () => {
    const p = resolverPagoPuertoOcr({ tipo: "gestion_aduanal", monto_sin_itbis: 7500, evidencia: { totales: [{ etiqueta: "Monto Total", monto: 8850, moneda: "DOP", alcance: "final" }], fechas: [{ etiqueta: "Payment Date", valor: "2026-10-25" }, { etiqueta: "Invoice Date", valor: "2026-10-24" }] } });
    assert.equal(p.monto, 7500); assert.equal(p.fecha, "2026-10-24");
    assert.equal(resolverPagoPuertoOcr({ tipo: "gestion_aduanal", evidencia: { totales: [{ etiqueta: "TOTAL", monto: 8850, alcance: "final" }] } }).monto, null);
  });
  it("acepta la moneda explícita en la etiqueta del total de tabla SIGA", () => {
    const p = resolverPagoPuertoOcr({ evidencia: { totales: [
      { etiqueta: "Monto", monto: 18353.76, alcance: "final" },
      { etiqueta: "Monto (RD$)", monto: 18353.76, alcance: "final" },
    ] } });
    assert.equal(p.monto, 18353.76); assert.equal(p.moneda, "DOP");
  });
});