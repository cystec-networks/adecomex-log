import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { generarPaqueteExclusivo, reemplazarPaquete } from "./paquete-rectificacion";

describe("un único Paquete Rectificación Técnica", () => {
  const repositorio = (ids: string[]) => {
    const filas = ids.map((id) => ({ id, storage_path: `${id}.pdf` }));
    let inserts = 0;
    const actualizados: string[] = [];
    const repo = {
      listar: async () => [...filas],
      actualizar: async (id: string) => { actualizados.push(id); },
      insertar: async () => { inserts++; filas.push({ id: "nuevo", storage_path: "nuevo.pdf" }); },
      eliminarDuplicados: async (ids: string[]) => {
        for (let i = filas.length - 1; i >= 0; i--) if (ids.includes(filas[i].id)) filas.splice(i, 1);
      },
    };
    return { repo, filas, actualizados, inserts: () => inserts };
  };
  test("primera generación guarda exactamente una entrada", async () => {
    const r = repositorio([]);
    await reemplazarPaquete(r.repo);
    assert.equal(r.filas.length, 1);
    assert.equal(r.inserts(), 1);
  });
  test("regenerar oficio de 202609I334 conserva un registro y reemplaza su PDF", async () => {
    const r = repositorio(["oficio-vigente", "oficio-duplicado"]);
    await reemplazarPaquete(r.repo);
    await reemplazarPaquete(r.repo);
    assert.deepEqual(r.filas.map((d) => d.id), ["oficio-vigente"]);
    assert.deepEqual(r.actualizados, ["oficio-vigente", "oficio-vigente"]);
    assert.equal(r.inserts(), 0);
  });
  test("segunda generación reemplaza sin insertar otra fila", async () => {
    const r = repositorio([]);
    await reemplazarPaquete(r.repo);
    await reemplazarPaquete(r.repo);
    assert.deepEqual(r.filas.map((d) => d.id), ["nuevo"]);
    assert.deepEqual(r.actualizados, ["nuevo"]);
    assert.equal(r.inserts(), 1);
  });
  test("consolida paquetes duplicados conservando la fila vigente", async () => {
    const r = repositorio(["vigente", "anterior", "duplicado"]);
    await reemplazarPaquete(r.repo);
    assert.deepEqual(r.filas.map((d) => d.id), ["vigente"]);
    assert.deepEqual(r.actualizados, ["vigente"]);
    assert.equal(r.inserts(), 0);
  });
  test("dos menús no pueden generar simultáneamente para el mismo expediente", async () => {
    let terminar: (() => void) | undefined;
    const primera = generarPaqueteExclusivo("exp", () => new Promise<void>((resolve) => { terminar = resolve; }));
    let ejecuciones = 0;
    assert.equal(await generarPaqueteExclusivo("exp", async () => { ejecuciones++; }), false);
    assert.equal(ejecuciones, 0);
    terminar?.();
    await primera;
    assert.equal(await generarPaqueteExclusivo("exp", async () => { ejecuciones++; }), true);
    assert.equal(ejecuciones, 1);
  });
});