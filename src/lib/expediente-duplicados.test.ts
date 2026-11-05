import { describe, expect, it } from "vitest";
import { diagnosticarDuplicadoExpediente, mensajeDuplicadoExpediente } from "./expediente-duplicados";

describe("diagnóstico de restricciones al guardar Expedientes", () => {
  it("identifica el número autogenerado rechazado por el guard compartido", () => {
    expect(diagnosticarDuplicadoExpediente({ code: "23505", message: "El número 202610I387 ya pertenece a otra operación." }, {})).toMatchObject({ campo: "numero", valor: "202610I387", entreOperaciones: true });
  });
  it("identifica número y valor devueltos por UNIQUE incluso sin número manual", () => {
    expect(diagnosticarDuplicadoExpediente({ code: "23505", message: 'duplicate key value violates unique constraint "expedientes_numero_key"', details: "Key (numero)=(202611I404) already exists." })).toMatchObject({ campo: "numero", valor: "202611I404" });
  });
  it("no confunde un número de permiso con un número de Expediente", () => {
    expect(diagnosticarDuplicadoExpediente({ code: "23505", message: 'duplicate key value violates unique constraint "idx_expedientes_numero_vuce_unico"' }, { numero: "202611I404", numero_vuce: "TRM-1026-2565293" })).toMatchObject({ campo: "numero_vuce", valor: "TRM-1026-2565293" });
  });
  it("identifica cualquier otro campo desde los detalles sin crear restricciones nuevas", () => {
    expect(diagnosticarDuplicadoExpediente({ code: "23505", details: "Key (bl_awb)=(MXO0818860) already exists." })).toMatchObject({ campo: "bl_awb", valor: "MXO0818860" });
  });
  it("conserva errores ajenos a duplicados", () => {
    expect(diagnosticarDuplicadoExpediente({ code: "23514", message: "La operación vinculada debe conservar su número de origen." })).toBeNull();
  });
  it("consulta solo el campo rechazado y mantiene el rechazo si la referencia no es visible", async () => {
    const consultas: string[][] = [];
    const resultado = await mensajeDuplicadoExpediente({ code: "23505", message: "El número 202610I387 ya pertenece a otra operación." }, {}, async (campo, valor) => { consultas.push([campo, valor]); return null; });
    expect(consultas).toEqual([["numero", "202610I387"]]);
    expect(resultado).not.toBeNull();
  });
});