import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acumularPagoVuce, leerPagoVuceTexto, permisosDelDocumento, costoDelPermiso, costoPorPinVuce, permisoDelCostoVuce, observacionesPagoVuce } from "./pago-vuce";
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
FORMAS DE PAGO: TRANSFERENCIA NUMERO/PIN: 20260924F07D3F40
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
  it("recibo extrae el PIN desde NUMERO/PIN de FORMAS DE PAGO como referencia", () => {
    const r = leerPagoVuceTexto(recibo);
    assert.equal(r?.referencia, "20260924F07D3F40");
    assert.deepEqual(r?.documentos_vuce, []);
  });
  it("recibo con banco y transacción captura solo el valor de NUMERO/PIN, nunca BANCO", () => {
    const texto = `Detalle Factura - VUCE RECIBO
Fecha: 25/09/2026
FORMAS DE PAGO: Banca Electrónica, NUMERO/PIN: 20260924F07D3F40, BANCO POPULAR DOMINICANO, NO. TRANSACCION: 68997508, MONTO: 5,800.00
TOTAL: RD$5,800.00`;
    const r = leerPagoVuceTexto(texto);
    assert.equal(r?.referencia, "20260924F07D3F40");
  });
  it("recibo con columnas intercaladas encuentra el PIN en la ventana y descarta el No. de transacción", () => {
    const texto = `Detalle Factura - VUCE RECIBO
Fecha: 25/09/2026
FORMAS DE PAGO: Banca Electrónica, NUMERO/PIN: BANCO POPULAR DOMINICANO, NO. TRANSACCION: 68997508, MONTO: 5,800.00 20260924F07D3F40
TOTAL: RD$5,800.00`;
    const r = leerPagoVuceTexto(texto);
    assert.equal(r?.referencia, "20260924F07D3F40");
  });
  it("recibo real tabular (encabezado NUMERO / PIN BANCO) captura el PIN de la fila y el TOTAL sin moneda", () => {
    const texto = `Recibo No. : 20260924-0322
Fecha : 25/09/2026
COMPROBANTE DE PAGO
RECIBIDO DE AGROLACTEOS IMANFA SRL $ : 5,800.00
TOTAL 5,800.00
FORMAS DE PAGO
TIPO DE PAGO NUMERO / PIN BANCO NO. TRANSACCION MONTO
Banca Electrónica 20260924F07D3F40 BANCO POPULAR DOMINICANO C POR A 68997508 5,800.00
TOTAL 5,800.00
Balance $ : 0.00
FACTURAS PAGADAS
10000-CL11-2609-005AD8`;
    const r = leerPagoVuceTexto(texto);
    assert.equal(r?.tipo, "vuce_recibo");
    assert.equal(r?.referencia, "20260924F07D3F40");
    assert.equal(r?.monto, 5800); assert.equal(r?.moneda, "DOP");
    assert.equal(r?.fecha, "2026-09-25");
  });
  it("cruce por PIN encuentra el costo aunque aún no tenga trámite y hereda el permiso", () => {
    const sinPermiso = { id: "c1", observaciones: "Fecha de pago: 2026-09-25 · PIN/Referencia: 20260924F07D3F40 · Recibo VUCE SIGA: OTD-011" };
    assert.equal(costoPorPinVuce([sinPermiso], "20260924F07D3F40")?.id, "c1");
    assert.equal(permisoDelCostoVuce(sinPermiso), "");
    const conPermiso = { id: "c2", observaciones: "PIN/Referencia: 20260924F07D3F40 · Permiso VUCE: TRM-0926-2533722 · PIN VUCE SIGA: OTD-010" };
    assert.equal(costoPorPinVuce([conPermiso], "20260924F07D3F40")?.id, "c2");
    assert.equal(permisoDelCostoVuce(conPermiso), "TRM-0926-2533722");
    assert.equal(costoPorPinVuce([conPermiso], "OTRO-PIN"), undefined);
    assert.equal(costoPorPinVuce([{ observaciones: "PIN/Referencia: 20260924F07D3F40" }], "20260924F07D3F40"), undefined);
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