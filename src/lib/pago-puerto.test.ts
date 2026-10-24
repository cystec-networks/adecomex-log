import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarPagoPuerto, documentoPagoPuerto, conceptoPagoPuerto, validarPagoPuerto, guardarPagoExclusivo } from "./pago-puerto";
describe("Comprobantes de pagos portuarios", () => {
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
    assert.deepEqual(normalizarPagoPuerto({ monto: 8649.79, moneda: "DOP", fecha: "2026-10-24", referencia: "DPW001", tipo: "almacenaje", confianza: "alta" }), { monto: 8649.79, moneda: "DOP", fecha: "2026-10-24", referencia: "DPW001", tipo: "almacenaje", confianza: "alta" });
  });
  it("bloquea guardados simultáneos sin ejecutar el segundo", async () => {
    let terminar = () => {};
    const pendiente = guardarPagoExclusivo("exp", () => new Promise<void>((resolve) => { terminar = resolve; }));
    let ejecutado = false;
    await assert.rejects(guardarPagoExclusivo("exp", async () => { ejecutado = true; }));
    assert.equal(ejecutado, false); terminar(); await pendiente;
    assert.equal(await guardarPagoExclusivo("exp", async () => 1), 1);
  });
});