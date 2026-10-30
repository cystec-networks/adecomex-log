import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumirPagosTransportistaPendientes } from "./pagos-transportista-kpi";

describe("KPI de pagos de transportista pendientes", () => {
  it("cuenta solo las solicitudes pendientes y suma su monto por moneda", () => {
    assert.deepEqual(resumirPagosTransportistaPendientes([
      { estado: "pendiente", monto: 1200, moneda: "USD" },
      { estado: "pendiente", monto: 45000.5, moneda: "DOP" },
      { estado: "pendiente", monto: 300, moneda: "USD" },
      { estado: "vinculada", monto: 9999, moneda: "DOP" },
      { estado: "anulada", monto: 8888, moneda: "DOP" },
    ]), { total: 3, sub: "RD$ 45,000.50 · US$ 1,500.00" });
  });

  it("sin solicitudes pendientes muestra cero y el aviso de nada por aprobar", () => {
    assert.deepEqual(
      resumirPagosTransportistaPendientes([{ estado: "vinculada", monto: 500, moneda: "USD" }]),
      { total: 0, sub: "Sin pagos por aprobar" },
    );
  });

  it("una solicitud sin moneda registrada se cuenta en pesos", () => {
    assert.deepEqual(
      resumirPagosTransportistaPendientes([{ estado: "pendiente", monto: 750, moneda: null }]),
      { total: 1, sub: "RD$ 750.00" },
    );
  });

  it("una solicitud pendiente sin monto no inventa un importe", () => {
    assert.deepEqual(
      resumirPagosTransportistaPendientes([{ estado: "pendiente", monto: null, moneda: "USD" }]),
      { total: 1, sub: "US$ 0.00" },
    );
  });

  it("una lista vacía sigue mostrando cero", () => {
    assert.deepEqual(resumirPagosTransportistaPendientes([]), { total: 0, sub: "Sin pagos por aprobar" });
  });
});
