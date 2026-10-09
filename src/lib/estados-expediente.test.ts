import { test } from "node:test";
import assert from "node:assert/strict";
import { checksForzables, calcularEtapa, DOCS_CORE_RECEPCION } from "./estados-expediente";

const todosDocs = DOCS_CORE_RECEPCION.map((tipo) => ({ tipo, estado: "recibido" }));

test("En Tránsito exige solo Factura comercial y BL", () => {
  assert.equal(checksForzables("digitar", "en_transito", { exp: {}, documentos: [] }).length, 1);
  assert.equal(checksForzables("digitar", "en_transito", { exp: {}, documentos: [{ tipo: "Factura comercial", estado: "recibido" }] }).length, 1);
  assert.equal(checksForzables("digitar", "en_transito", { exp: {}, documentos: [{ tipo: "Bill of Lading", estado: "recibido" }] }).length, 1);
  assert.equal(checksForzables("digitar", "en_transito", { exp: {}, documentos: todosDocs }).length, 0);
});
test("Verificado exige Tipo de Inspección; un valor antiguo cuenta", () => {
  assert.equal(checksForzables("presentar", "verificar", { exp: { canal_riesgo: "" } }).length, 1);
  assert.equal(checksForzables("presentar", "verificar", { exp: { canal_riesgo: "Rojo" } }).length, 0);
});
test("Entregado exige factura de venta enviada y Facturado la e-CF vinculada", () => {
  assert.equal(checksForzables("despachado", "entregado", { exp: { factura_ecf_id: "x" }, facturaVentaEnviada: false }).length, 1);
  assert.equal(checksForzables("entregado", "facturar", { exp: {} }).length, 1);
  assert.equal(checksForzables("entregado", "facturar", { exp: { factura_ecf_id: "x" } }).length, 0);
});
test("saltar estados lista todos los requisitos juntos", () => {
  assert.equal(checksForzables("presentar", "facturar", { exp: {}, permisosPendientes: [{ tipo: "sanitario", estado: "solicitado" }] }).length, 4);
});
test("Etapa descuenta «No aplica» del numerador y del denominador", () => {
  const r = calcularEtapa({ hitos: [{ estado: "completado" }, { estado: "no_aplica" }, { estado: "pendiente" }], documentos: [{ tipo: "A", estado: "recibido" }], permisos: [{ estado: "aprobado" }, { estado: "solicitado" }], checklist: ["A", "B"] });
  assert.deepEqual(r, { cumplidos: 3, total: 6 });
});
test("Presentado exige Factura comercial y BL adjuntos", () => {
  assert.equal(checksForzables("manifestado", "presentar", { exp: {}, documentos: [] }).length, 1);
  const docs = [{ tipo: "Factura comercial", estado: "recibido", storage_path: "a.pdf" }, { tipo: "Bill of Lading", estado: "recibido", storage_path: "b.pdf" }];
  assert.equal(checksForzables("manifestado", "presentar", { exp: {}, documentos: docs }).length, 0);
});

import { pendientesSiguienteEstado } from "./estados-expediente";
describe("pendientesSiguienteEstado", () => {
  it("En Tránsito solo pide la Fecha de Llegada Real, sin PIN ni despacho", () => {
    const r = pendientesSiguienteEstado("en_transito", { exp: { estado: "en_transito" }, tieneGastos: false, tieneFactura: false });
    expect(r.siguiente).toBe("manifestado");
    expect(r.pendientes).toEqual(["Falta la Fecha de Llegada Real (Información General)"]);
  });
  it("Presentado lista todos los faltantes juntos", () => {
    const r = pendientesSiguienteEstado("manifestado", { exp: { fecha_llegada_real: "2026-10-01" }, tieneGastos: false, tieneFactura: false, documentos: [] });
    expect(r.pendientes.length).toBe(5);
  });
  it("Verificado incluye PIN y Fecha de Aprobación", () => {
    const r = pendientesSiguienteEstado("verificar", { exp: { numero_igra: "1", numero_dua: "1", regimen_aduanero: "1", liq_siga_numero: "1" }, tieneGastos: true, tieneFactura: false });
    expect(r.pendientes.some((p) => p.includes("PIN"))).toBe(true);
  });
});
