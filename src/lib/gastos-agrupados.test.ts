import { describe, expect, it } from "vitest";
import { agruparGastosHonorarios } from "./gastos-agrupados";

const h = (id: string, proveedor: string, monto: number, extra = {}) => ({ id, concepto: "Honorarios de terceros", proveedor, monto, es_reembolso: false, ...extra });

describe("agruparGastosHonorarios", () => {
  it("suma dos honorarios del mismo proveedor en una fila", () => {
    const f = agruparGastosHonorarios([h("1", "MARCOS BERAS", 2500), h("2", "MARCOS BERAS", 1500)]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ tipo: "grupo", total: 4000 });
  });
  it("no agrupa un honorario único ni otros conceptos o reembolsos", () => {
    const f = agruparGastosHonorarios([
      h("1", "MARCOS BERAS", 2500),
      h("2", "FRANCISCO MATOS", 1000),
      h("3", "FRANCISCO MATOS", 500, { es_reembolso: true }),
      { id: "4", concepto: "Transporte", proveedor: "MARCOS BERAS", monto: 10, es_reembolso: false },
    ]);
    expect(f.every((x) => x.tipo === "simple")).toBe(true);
  });
});
