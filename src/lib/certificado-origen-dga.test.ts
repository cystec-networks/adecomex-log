import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirCertificadoDga, normalizarCertificadoDga, guardarReferenciaCertificado, leerReferenciaCertificado } from "./certificado-origen-dga";
const acuerdos = [{ codigo: "EPA", nombre: "EPA" }];
const datos = normalizarCertificadoDga({ numero: "10150-IC13-2610-000949", acuerdo: "EPA", exportador: "Exportador real", productor: "Productor real" });
describe("Constancia oficial DGA", () => {
  it("exige confirmar CO-2026-00123 antes de reemplazar por 10150-IC13-2610-000949", () => {
    const actual = { numero_certificado_origen: "CO-2026-00123", acuerdo_comercial: "EPA", acuerdo_codigo: "EPA" };
    const pendiente = decidirCertificadoDga(actual, datos, acuerdos);
    assert.equal(pendiente.conflictoNumero, true);
    assert.equal(pendiente.cambios.numero_certificado_origen, undefined);
    assert.equal(decidirCertificadoDga(actual, datos, acuerdos, true).cambios.numero_certificado_origen, "10150-IC13-2610-000949");
  });
  it("mantiene EPA sin conflicto ni escrituras de acuerdo", () => {
    const r = decidirCertificadoDga({ acuerdo_comercial: "EPA", acuerdo_codigo: "EPA" }, datos, acuerdos);
    assert.equal(r.conflictoAcuerdo, false);
    assert.equal(r.cambios.acuerdo_codigo, undefined);
  });
  it("no reemplaza DR-CAFTA con EPA", () => {
    const r = decidirCertificadoDga({ acuerdo_comercial: "DR-CAFTA", acuerdo_codigo: "DR-CAFTA" }, datos, acuerdos);
    assert.equal(r.conflictoAcuerdo, true);
    assert.equal(r.cambios.acuerdo_comercial, undefined);
  });
  it("completa acuerdo vacío usando su código de catálogo", () => {
    assert.deepEqual(decidirCertificadoDga({}, datos, [{ codigo: "3", nombre: "EPA" }]).cambios, { numero_certificado_origen: "10150-IC13-2610-000949", acuerdo_codigo: "3", acuerdo_comercial: "EPA", preferencia_comercial: "EPA" });
  });
  it("no inventa valores ausentes ni selecciona acuerdos desconocidos", () => {
    assert.equal(normalizarCertificadoDga({ numero: "-" }).numero, null);
    assert.deepEqual(decidirCertificadoDga({}, normalizarCertificadoDga({ acuerdo: "Desconocido" }), acuerdos).cambios, {});
  });
  it("conserva observaciones y reemplaza una sola referencia documental", () => {
    const obs = guardarReferenciaCertificado(guardarReferenciaCertificado("Nota manual", datos), { ...datos, emisor: "DGA" });
    assert.equal(obs.startsWith("Nota manual"), true);
    assert.equal(obs.split("[Constancia de Origen DGA]").length, 2);
    assert.equal(leerReferenciaCertificado(obs).includes("Emisor: DGA"), true);
    assert.equal(leerReferenciaCertificado(obs).includes("Productor: Productor real"), true);
  });
});