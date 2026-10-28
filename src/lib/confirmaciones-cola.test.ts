import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listarConfirmacionesPendientes, marcarConfirmacionEnviada, respuestaCola } from "./confirmaciones-cola";

const id = "f7fac307-1759-4097-a44e-ec9c445ed02d";
type Row = { id: string; estado: string; enviado_en: string | null };
function fakeDB(rows: Row[], options: { noPersist?: boolean; readError?: boolean } = {}) {
  return {
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Partial<Row> | undefined;
      const execute = () => {
        const found = rows.filter((r) => filters.every((f) => f(r)));
        if (patch && !options.noPersist) found.forEach((r) => Object.assign(r, patch));
        return { data: found, error: null };
      };
      const query = {
        select: (_fields: string) => query,
        update: (values: Partial<Row>) => { patch = values; return query; },
        eq: (key: keyof Row, value: unknown) => { filters.push((r) => r[key] === value); return query; },
        is: (key: keyof Row, value: null) => { filters.push((r) => r[key] === value); return query; },
        order: () => query,
        maybeSingle: async () => ({ data: execute().data[0] ?? null, error: options.readError ? new Error("read failed") : null }),
        then: (resolve: (v: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  } as unknown as Parameters<typeof listarConfirmacionesPendientes>[0];
}

describe("confirmaciones pendientes", () => {
  it("persiste enviada y jamás devuelve el ID enviado en consultas posteriores", async () => {
    const rows = [{ id, estado: "pendiente", enviado_en: null }];
    const db = fakeDB(rows);
    assert.equal((await listarConfirmacionesPendientes(db))[0]?.id, id);
    assert.equal((await marcarConfirmacionEnviada(db, id)).status, 200);
    assert.equal(rows[0].estado, "enviada");
    assert.ok(rows[0].enviado_en);
    for (let i = 0; i < 3; i++) assert.deepEqual(await listarConfirmacionesPendientes(db), []);
  });
  it("excluye incluso un estado pendiente inconsistente con fecha de envío", async () => {
    assert.deepEqual(await listarConfirmacionesPendientes(fakeDB([{ id, estado: "pendiente", enviado_en: "2026-10-28T00:25:38.232Z" }])), []);
  });
  it("ACK repetido conserva la fecha real de las 8:25:38 p. m.", async () => {
    const enviado_en = "2026-10-28T00:25:38.232Z";
    const rows = [{ id, estado: "enviada", enviado_en }];
    const response = await marcarConfirmacionEnviada(fakeDB(rows), id);
    assert.deepEqual(await response.json(), { resultado: "ya_enviada", id, enviado_en });
    assert.equal(rows[0].enviado_en, enviado_en);
  });
  it("no responde éxito si el UPDATE no persistió", async () => {
    assert.equal((await marcarConfirmacionEnviada(fakeDB([{ id, estado: "pendiente", enviado_en: null }], { noPersist: true }), id)).status, 409);
  });
  it("propaga errores al verificar persistencia", async () => {
    await assert.rejects(marcarConfirmacionEnviada(fakeDB([{ id, estado: "enviada", enviado_en: "2026-10-28T00:25:38.232Z" }], { readError: true }), id), /read failed/);
  });
  it("ID inexistente no se declara enviado", async () => {
    assert.equal((await marcarConfirmacionEnviada(fakeDB([]), id)).status, 404);
  });
  it("la cola y sus errores prohíben almacenamiento de respuestas antiguas", () => {
    for (const status of [200, 401, 500]) {
      const response = respuestaCola({}, status);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
      assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
      assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
    }
  });
});