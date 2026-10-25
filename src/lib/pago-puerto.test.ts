import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarPagoPuerto, documentoPagoPuerto, conceptoPagoPuerto, validarPagoPuerto, guardarPagoExclusivo, resumenPagoPuerto, esConceptoPagoPuerto } from "./pago-puerto";
describe("Comprobantes de pagos portuarios", () => {
  it("Gestión Aduanal conserva NCF y fecha y se destina a Finanzas", () => {
    const p = normalizarPagoPuerto({ monto: 8850, monto_sin_itbis: 7500, moneda: "DOP", fecha: "2026-10-24", referencia: "E310000000335", tipo: "gestion_aduanal", confianza: "alta" });
    assert.equal(p.tipo, "gestion_aduanal"); assert.equal(p.monto, 7500); assert.equal(p.referencia, "E310000000335"); assert.equal(p.fecha, "2026-10-24");
    assert.equal(conceptoPagoPuerto("gestion_aduanal", ""), "Gestión Aduanal");
    assert.equal(documentoPagoPuerto("gestion_aduanal"), "PDF de Factura e-CF en Finanzas");
    validarPagoPuerto({ tipo: "gestion_aduanal", monto: "11800", moneda: "DOP" });
  });
  it("Cargos Locales se destina a su casilla recibida", () => {
    assert.equal(normalizarPagoPuerto({ tipo: "cargos_locales" }).tipo, "cargos_locales");
    assert.equal(documentoPagoPuerto("cargos_locales"), "Factura Pago Cargos Locales");
    assert.equal(conceptoPagoPuerto("cargos_locales", "PIN001"), "Cargos Locales");
    validarPagoPuerto({ tipo: "cargos_locales", monto: "2500.50", moneda: "DOP" });
  });
  it("Almacenaje DPW corresponde a su factura", () => {
    assert.equal(documentoPagoPuerto("almacenaje"), "Factura Pago de Almacenaje");
    assert.equal(conceptoPagoPuerto("almacenaje", "DPW123"), "Almacenaje — DPW");
  });
  it("Depósito DPH corresponde al recibo de contenedor", () => {
    assert.equal(documentoPagoPuerto("contenedor"), "Recibo Pago de Contenedor");
    assert.equal(conceptoPagoPuerto("contenedor", "DPH456"), "Depósito de Contenedor — DPH");
  });
  it("no deduce tipo por el PIN y exige selección si falta", () => {
    assert.equal(normalizarPagoPuerto({ referencia: "DPH456" }).tipo, null);
    assert.throws(() => validarPagoPuerto({ tipo: "", monto: "2500", moneda: "DOP" }));
  });
  it("no convierte monto ausente en cero ni permite guardarlo", () => {
    assert.equal(normalizarPagoPuerto({ monto: null }).monto, null);
    assert.throws(() => validarPagoPuerto({ tipo: "almacenaje", monto: "", moneda: "DOP" }));
  });
  it("conserva monto, moneda, fecha y PIN extraídos", () => {
    assert.deepEqual(normalizarPagoPuerto({ monto_sin_itbis: null, monto: 8649.79, moneda: "DOP", fecha: "2026-10-24", referencia: "DPW001", tipo: "almacenaje", confianza: "alta" }), { monto_sin_itbis: null, monto: 8649.79, moneda: "DOP", fecha: "2026-10-24", referencia: "DPW001", tipo: "almacenaje", confianza: "alta" });
  });
  it("bloquea guardados simultáneos sin ejecutar el segundo", async () => {
    let terminar = () => {};
    const pendiente = guardarPagoExclusivo("exp", () => new Promise<void>((resolve) => { terminar = resolve; }));
    let ejecutado = false;
    await assert.rejects(guardarPagoExclusivo("exp", async () => { ejecutado = true; }));
    assert.equal(ejecutado, false); terminar(); await pendiente;
    assert.equal(await guardarPagoExclusivo("exp", async () => 1), 1);
  });
  it("muestra el monto antes que fecha, PIN y documento SIGA", () => {
    assert.deepEqual(resumenPagoPuerto("34976.95", "DOP", "Fecha de pago: 2026-10-24 · PIN/Referencia: Q02910460 · Documento SIGA: OTD-006"), { monto: "RD$34,976.95", detalle: "Fecha de pago: 2026-10-24 · PIN/Referencia: Q02910460 · Documento SIGA: OTD-006" });
  });
  it("respeta la moneda del costo y el formato histórico de pago", () => {
    assert.equal(resumenPagoPuerto("467.00", "USD", "Fecha de pago: 2026-10-23").monto, "US$ 467.00");
    assert.deepEqual(resumenPagoPuerto("21240.00", "DOP", "PIN DPH · Pagado 21/09/2026"), { monto: "RD$21,240.00", detalle: "PIN DPH, pagado 21/09/2026" });
  });
  it("deja sin monto los costos sin importe capturado", () => {
    assert.deepEqual(resumenPagoPuerto(null, "DOP", "PIN PORTCOLLECT"), { monto: "", detalle: "PIN PORTCOLLECT" });
    assert.equal(resumenPagoPuerto("", "DOP", "").monto, "");
  });
  it("reconoce el Depósito de Contenedor guardado en Costos como pago de contenedor", () => {
    assert.equal(esConceptoPagoPuerto("Depósito de Contenedor", "contenedor"), true);
    assert.equal(esConceptoPagoPuerto("Depósito de Contenedor — DPH", "contenedor"), true);
    assert.equal(esConceptoPagoPuerto("Demora de contenedor", "contenedor"), true);
    assert.equal(esConceptoPagoPuerto("Almacenaje", "contenedor"), false);
    assert.equal(esConceptoPagoPuerto("Depósito de Contenedor", "almacenaje"), false);
    assert.equal(esConceptoPagoPuerto("Almacenaje — DPW", "almacenaje"), true);
    assert.equal(esConceptoPagoPuerto("Gestión Aduanal", "gestion_aduanal"), true);
    assert.equal(esConceptoPagoPuerto("Cargos Locales", "cargos_locales"), true);
  });
});

it("Gestión sin base OCR no usa el total con ITBIS; base cero se conserva", () => {
  assert.equal(normalizarPagoPuerto({ tipo: "gestion_aduanal", monto: 8850 }).monto, null);
  assert.equal(normalizarPagoPuerto({ tipo: "gestion_aduanal", monto: 8850, monto_sin_itbis: 0 }).monto, 0);
  assert.equal(normalizarPagoPuerto({ tipo: null, monto: 8850, monto_sin_itbis: 7500 }).monto_sin_itbis, 7500);
});
