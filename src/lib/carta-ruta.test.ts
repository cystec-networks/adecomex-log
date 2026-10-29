import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerCartaRuta, normalizarCartaRuta, decidirDespachoCartaRuta, guardarReferenciaCartaRuta, leerReferenciaCartaRuta } from "./carta-ruta";
const datos = { solicitud: "IGRA20261040517", numero: "TN202610428790", salida: "29/10/2026" };
describe("Carta de Ruta", () => {
  it("completa el despacho vacío con No.Solicitud", () => {
    assert.deepEqual(decidirDespachoCartaRuta("", datos).cambios, { numero_igra: "IGRA20261040517" });
  });
  it("requiere confirmación para sustituir un despacho distinto", () => {
    assert.deepEqual(decidirDespachoCartaRuta("IGRA20261000001", datos), { conflicto: true, cambios: {} });
    assert.deepEqual(decidirDespachoCartaRuta("IGRA20261000001", datos, true).cambios, { numero_igra: "IGRA20261040517" });
  });
  it("no cambia un despacho coincidente", () => {
    assert.deepEqual(decidirDespachoCartaRuta(datos.solicitud, datos).cambios, {});
  });
  it("extrae las tres etiquetas sin confundir identificadores", () => {
    assert.deepEqual(leerCartaRuta("Carta de Ruta\nNo.Solicitud: IGRA20261040517\nNo.Carta Ruta: TN202610428790\nHora Salida: 29/10/2026"), datos);
  });
  it("no inventa datos ausentes", () => {
    assert.deepEqual(normalizarCartaRuta({ numero: datos.numero }), { solicitud: null, numero: datos.numero, salida: null });
    assert.deepEqual(decidirDespachoCartaRuta("", normalizarCartaRuta({})).cambios, {});
  });
  it("conserva referencias y notas sin duplicar al reemplazar", () => {
    const obs = guardarReferenciaCartaRuta(guardarReferenciaCartaRuta("Nota manual", datos), datos);
    assert.equal(obs.match(/\[Carta de Ruta\]/g)?.length, 1);
    assert.ok(obs.includes("Nota manual"));
    assert.equal(leerReferenciaCartaRuta(obs), "No.Solicitud: IGRA20261040517 · No.Carta Ruta: TN202610428790 · Hora Salida: 29/10/2026");
  });
});