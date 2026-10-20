import { it } from "node:test";
import assert from "node:assert/strict";
import { codigoOchoDigitos, elegirCandidatoReal, eleccionesPorLinea, naturalezaChoozit, candidatosManuales } from "./copiloto-candidatos";
const cultivo = { codigo: "3002.90.10", descripcion: "Cultivos de microorganismos", contexto: "", gravamen_pct: 0, exento_itbis: true };
it("CHOOZIT puede elegir solo 3002.90.10 entre candidatos reales", () => assert.equal(elegirCandidatoReal(0, "alta", [cultivo])?.codigo, "3002.90.10"));
it("rechaza un código inventado en vez de un índice", () => assert.equal(elegirCandidatoReal("3002.40.00.00", "alta", [cultivo]), null));
it("rechaza índices que no están en la búsqueda", () => assert.equal(elegirCandidatoReal(1, "alta", [cultivo]), null));
it("sin confianza no fuerza una partida", () => assert.equal(elegirCandidatoReal(0, "baja", [cultivo]), null));
it("formatea ocho dígitos reales y rechaza diez dígitos", () => { assert.equal(codigoOchoDigitos("30029010"), "3002.90.10"); assert.equal(codigoOchoDigitos("3002.40.00.00"), null); });
it("normaliza respuestas por línea sin perder la selección CHOOZIT", () => assert.deepEqual(eleccionesPorLinea([{ elecciones: [{ indice: 0, confianza: "alta" }] }, { elecciones: [{ indice: null, confianza: "baja" }] }]), [{ indice: 0, confianza: "alta" }, { indice: null, confianza: "baja" }]));
it("CHOOZIT MA11 y sus cinco hermanos comparten naturaleza sin importar espacios, mayúsculas o referencia", () => {
  for (const ref of ["MA 11", "MM100", "MM101", "TM 81", "TM 82", "MA 16"]) assert.equal(naturalezaChoozit(`choozit  ${ref} LYO 50 DCU Ref. 50406`), "Cultivos de microorganismos");
  assert.equal(naturalezaChoozit("ELECTRODO DE PENETRACION REF. FC2023 HANNA"), null);
});
it("limita a tres alternativas reales en orden, rechazando índices inválidos y duplicados", () => {
  const reales = [cultivo, ...["9027.90.10", "9027.90.90", "9027.80.00"].map((codigo) => ({ ...cultivo, codigo }))];
  assert.deepEqual(candidatosManuales([2, 2, 99, "3002.40.00.00", 1, 0, 3], reales).map((c) => c.codigo), ["9027.90.90", "9027.90.10", "3002.90.10"]);
});
it("sin alternativas relevantes no fuerza resultados del capítulo", () => assert.deepEqual(candidatosManuales([], [cultivo]), []));