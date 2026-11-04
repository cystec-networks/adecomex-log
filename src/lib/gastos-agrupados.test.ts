import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparHonorariosPendientes } from "./gastos-agrupados";

const h = (id: string, proveedor: string, monto: number, extra: Partial<{ expedienteId: string; estado: "pendiente" | "pagado"; fecha: string }> = {}) => ({ id, expedienteId: "202610I364", proveedor, monto, estado: "pendiente" as const, fecha: "2026-11-02", ...extra });

describe("agruparHonorariosPendientes", () => {
  it("202610I364 suma 2500 del 02/11 y 500 del 04/11 y conserva el detalle", () => {
    const gastos = [h("1", "MARCOS BERAS", 2500), h("2", "MARCOS BERAS", 500, { fecha: "2026-11-04" })];
    const f = agruparHonorariosPendientes(gastos);
    assert.equal(f.length, 1);
    assert.equal(f[0].tipo, "grupo");
    assert.equal(f[0].tipo === "grupo" && f[0].total, 3000);
    assert.deepEqual(f[0].tipo === "grupo" && f[0].gastos, gastos);
  });
  it("no agrupa proveedores distintos", () => {
    const f = agruparHonorariosPendientes([
      h("1", "MARCOS BERAS", 2500),
      h("2", "FRANCISCO MATOS", 1000),
    ]);
    assert.ok(f.every((x) => x.tipo === "simple"));
  });
  it("no agrupa expedientes distintos del mismo proveedor", () => {
    const f = agruparHonorariosPendientes([h("1", "MARCOS BERAS", 2500), h("2", "MARCOS BERAS", 500, { expedienteId: "otro" })]);
    assert.equal(f.length, 2);
    assert.ok(f.every((x) => x.tipo === "simple"));
  });
  it("no mezcla pagados con pendientes ni agrupa pagos históricos", () => {
    const f = agruparHonorariosPendientes([h("1", "MARCOS BERAS", 2500), h("2", "MARCOS BERAS", 500, { estado: "pagado" }), h("3", "MARCOS BERAS", 100, { estado: "pagado" })]);
    assert.equal(f.length, 3);
    assert.ok(f.every((x) => x.tipo === "simple"));
  });
});
