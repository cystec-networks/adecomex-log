import { describe, it, expect } from "vitest";
import { leerCartaRuta, normalizarCartaRuta, decidirDespachoCartaRuta, guardarReferenciaCartaRuta, leerReferenciaCartaRuta } from "./carta-ruta";
const datos = { solicitud: "IGRA20261040517", numero: "TN202610428790", salida: "29/10/2026" };
describe("Carta de Ruta", () => {
  it("completa el despacho vacío con No.Solicitud", () => {
    expect(decidirDespachoCartaRuta("", datos).cambios).toEqual({ numero_igra: "IGRA20261040517" });
  });
  it("requiere confirmación para sustituir un despacho distinto", () => {
    expect(decidirDespachoCartaRuta("IGRA20261000001", datos)).toEqual({ conflicto: true, cambios: {} });
    expect(decidirDespachoCartaRuta("IGRA20261000001", datos, true).cambios).toEqual({ numero_igra: "IGRA20261040517" });
  });
  it("no cambia un despacho coincidente", () => {
    expect(decidirDespachoCartaRuta(datos.solicitud, datos).cambios).toEqual({});
  });
  it("extrae las tres etiquetas sin confundir identificadores", () => {
    expect(leerCartaRuta("Carta de Ruta\nNo.Solicitud: IGRA20261040517\nNo.Carta Ruta: TN202610428790\nHora Salida: 29/10/2026")).toEqual(datos);
  });
  it("no inventa datos ausentes", () => {
    expect(normalizarCartaRuta({ numero: datos.numero })).toEqual({ solicitud: null, numero: datos.numero, salida: null });
    expect(decidirDespachoCartaRuta("", normalizarCartaRuta({})).cambios).toEqual({});
  });
  it("conserva referencias y notas sin duplicar al reemplazar", () => {
    const obs = guardarReferenciaCartaRuta(guardarReferenciaCartaRuta("Nota manual", datos), datos);
    expect(obs.match(/\[Carta de Ruta\]/g)).toHaveLength(1);
    expect(obs).toContain("Nota manual");
    expect(leerReferenciaCartaRuta(obs)).toBe("No.Solicitud: IGRA20261040517 · No.Carta Ruta: TN202610428790 · Hora Salida: 29/10/2026");
  });
});