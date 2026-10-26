import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acumularPagoVuce, leerPagoVuceTexto, permisosDelDocumento, costoDelPermiso, observacionesPagoVuce } from "./pago-vuce";
import { resolverPagoPuertoOcr } from "./pago-puerto-ocr";
import { costoUnitarioReal } from "./liquidacion-final";

const pin = `Detalle PIN - VUCE
No. PIN: 20260924F07D3F40
Monto Total: RD$5,800.00
Fecha de Registro: 24/09/2026
Listado de Facturas
No. Documento: TRM-0926-2533722`;
const recibo = `Detalle Factura - VUCE RECIBO
Fecha: 25/09/2026
Fecha de Vencimiento: 24/12/2026
TOTAL: RD$5,800.00`;
describe("Pagos complementarios VUCE", () => {
  it("PIN extrae monto íntegro, referencia y trámite del listado sin fecha de pago", () => {
    const p = leerPagoVuceTexto(pin);
    assert.equal(p?.monto, 5800); assert.equal(p?.moneda, "DOP"); assert.equal(p?.referencia, "20260924F07D3F40");
    assert.deepEqual(p?.documentos_vuce, ["TRM-0926-2533722"]); assert.equal(p?.fecha, null);
  });
  it("recibo toma Fecha y TOTAL, no vencimiento ni exclusión de ITBIS", () => {
    const r = leerPagoVuceTexto(recibo);
    assert.equal(r?.fecha, "2026-09-25"); assert.equal(r?.monto, 5800);
  });
  it("cruce exacto por trámite no asume el único permiso si no coincide", () => {
    const permisos = [{ numero: "TRM-0926-2533722" }];
    assert.equal(permisosDelDocumento(permisos, ["TRM-0926-2533722"]).length, 1);
    assert.equal(permisosDelDocumento(permisos, ["TRM-0926-9999999"]).length, 0);
    assert.equal(permisosDelDocumento(permisos, []).length, 0);
  });
  it("recibo conserva monto del PIN y completa fecha; reemplazar PIN conserva fecha", () => {
    const prev = { monto_real: 5800, moneda: "DOP", observaciones: "PIN/Referencia: 20260924F07D3F40" };
    const datos = acumularPagoVuce("vuce_recibo", { monto: "9999", moneda: "USD", fecha: "2026-09-25", referencia: "RECIBO" }, prev);
    assert.deepEqual(datos, { monto: "5800", moneda: "DOP", fecha: "2026-09-25", referencia: "20260924F07D3F40" });
    const nuevo = acumularPagoVuce("vuce_pin", { monto: "6000", moneda: "DOP", fecha: "", referencia: "PIN-NUEVO" }, { ...prev, observaciones: "Fecha de pago: 2026-09-25" });
    assert.equal(nuevo.fecha, "2026-09-25"); assert.equal(nuevo.monto, "6000");
  });
  it("recibo primero completa monto faltante y conserva su fecha al recibir PIN", () => {
    const datos = acumularPagoVuce("vuce_recibo", { monto: "5800", moneda: "DOP", fecha: "2026-09-25", referencia: "" });
    assert.equal(datos.monto, "5800"); assert.equal(datos.fecha, "2026-09-25");
  });
  it("dos documentos mantienen una identidad por permiso y ambos códigos", () => {
    const a = observacionesPagoVuce("TRM-0926-2533722", "OTD-010", "vuce_pin", { fecha: "", referencia: "20260924F07D3F40" });
    const b = observacionesPagoVuce("TRM-0926-2533722", "OTD-011", "vuce_recibo", { fecha: "2026-09-25", referencia: "20260924F07D3F40" }, a);
    assert.ok(b.includes("PIN VUCE SIGA: OTD-010")); assert.ok(b.includes("Recibo VUCE SIGA: OTD-011"));
    assert.equal(costoDelPermiso([{ id: "costo", observaciones: b }], "TRM-0926-2533722")?.id, "costo");
    assert.equal(costoDelPermiso([{ observaciones: b }], "TRM-OTRO"), undefined);
  });
  it("OCR VUCE solo admite Fecha del recibo, PIN nunca usa Registro", () => {
    const evidencia = { totales: [{ etiqueta: "Monto Total", monto: 5800, moneda: "DOP", alcance: "final" }], fechas: [{ etiqueta: "Fecha", valor: "2026-09-25" }, { etiqueta: "Fecha de Registro", valor: "2026-09-24" }] };
    assert.equal(resolverPagoPuertoOcr({ tipo: "vuce_recibo", evidencia }).fecha, "2026-09-25");
    assert.equal(resolverPagoPuertoOcr({ tipo: "vuce_pin", evidencia }).fecha, null);
  });
  it("RD$5800 se incluye íntegro en costo unitario sin ITBIS deducido", () => {
    assert.equal(costoUnitarioReal(1000, 0, 0, 5800 / 58, 1, 100), 11);
  });
});