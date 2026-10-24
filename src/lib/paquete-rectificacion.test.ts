import { describe, expect, test } from "bun:test";
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
    expect(r.filas.length).toBe(1);
    expect(r.inserts()).toBe(1);
  });
  test("segunda generación reemplaza sin insertar otra fila", async () => {
    const r = repositorio([]);
    await reemplazarPaquete(r.repo);
    await reemplazarPaquete(r.repo);
    expect(r.filas.map((d) => d.id)).toEqual(["nuevo"]);
    expect(r.actualizados).toEqual(["nuevo"]);
    expect(r.inserts()).toBe(1);
  });
  test("consolida paquetes duplicados conservando la fila vigente", async () => {
    const r = repositorio(["vigente", "anterior", "duplicado"]);
    await reemplazarPaquete(r.repo);
    expect(r.filas.map((d) => d.id)).toEqual(["vigente"]);
    expect(r.actualizados).toEqual(["vigente"]);
    expect(r.inserts()).toBe(0);
  });
  test("dos menús no pueden generar simultáneamente para el mismo expediente", async () => {
    let terminar: (() => void) | undefined;
    const primera = generarPaqueteExclusivo("exp", () => new Promise<void>((resolve) => { terminar = resolve; }));
    let ejecuciones = 0;
    expect(await generarPaqueteExclusivo("exp", async () => { ejecuciones++; })).toBe(false);
    expect(ejecuciones).toBe(0);
    terminar?.();
    await primera;
    expect(await generarPaqueteExclusivo("exp", async () => { ejecuciones++; })).toBe(true);
    expect(ejecuciones).toBe(1);
  });
});