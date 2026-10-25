import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GuardadoExpediente } from "./expediente-guardado";

describe("Guardado global del expediente", () => {
  for (const ficha of ["Generales", "Documentos", "Permisos", "Finanzas", "Transportes", "Costos", "Liquidación", "Recepción", "Incidencias", "Seguimientos"]) {
    it(`${ficha} activa el indicador y se guarda sin depender de la ficha visible`, async () => {
      const registro = new GuardadoExpediente(); let guardados = 0;
      registro.registrar(ficha, { hayCambios: true, pendiente: false, guardar: async () => { guardados++; registro.registrar(ficha, { hayCambios: false, pendiente: false, guardar: async () => {} }); } });
      assert.equal(registro.hayCambios, true);
      await registro.guardar(); assert.equal(guardados, 1); assert.equal(registro.hayCambios, false);
    });
  }
  it("guarda solo borradores y evita doble clic", async () => {
    const r = new GuardadoExpediente(); let n = 0;
    r.registrar("costos", { hayCambios: true, pendiente: false, guardar: async () => { n++; } });
    r.registrar("generales", { hayCambios: false, pendiente: false, guardar: async () => { throw Error("No debe guardar"); } });
    await Promise.all([r.guardar(), r.guardar()]); assert.equal(n, 1);
  });
  it("conserva pendientes y error cuando falla la validación", async () => {
    const r = new GuardadoExpediente();
    r.registrar("costos", { hayCambios: true, pendiente: false, guardar: async () => { throw Error("Inválido"); } });
    await assert.rejects(r.guardar()); assert.equal(r.hayCambios, true); assert.equal(r.estado, "error"); assert.equal(r.pendiente, false);
  });
});