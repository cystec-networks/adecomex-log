import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularLineaServicio, subtotalFila, totalServicioUsd, type TarifaServicio } from "./servicio-aduanero-calculo";

const kg: TarifaServicio = { id: "kg", tipo_despacho: "Despacho carga consolidada importada por kilo o fracción de kilo", unidad: "kg", tarifa_usd: 0.37 };

describe("Tope exclusivo del despacho consolidado por kilo", () => {
  it("2,750 kg: subtotal y total US$88.24, con tope aplicado", () => {
    assert.deepEqual(calcularLineaServicio(kg, 2750), { subtotal: 88.24, topeAplicado: true });
    assert.equal(subtotalFila({ tipo_despacho: "kg", cantidad: 2750 }, [kg]), 88.24);
    assert.equal(totalServicioUsd([{ tipo_despacho: "kg", cantidad: 2750 }], [kg]), 88.24);
  });
  it("170 kg: US$62.90 sin tope", () => {
    const linea = calcularLineaServicio(kg, 170);
    assert.equal(Number(linea.subtotal.toFixed(2)), 62.90);
    assert.equal(linea.topeAplicado, false);
  });
  it("otros despachos conservan tarifa por cantidad sin ese tope", () => {
    for (const [unidad, tarifa_usd] of [["contenedor20", 110.31], ["contenedor4045", 147.07], ["vehiculo", 147.07], ["tm", 0.74]] as const) {
      const tarifa = { ...kg, unidad, tarifa_usd };
      assert.deepEqual(calcularLineaServicio(tarifa, 2750), { subtotal: tarifa_usd * 2750, topeAplicado: false });
    }
  });
  it("el total suma la línea limitada y las otras líneas completas", () => {
    const contenedor = { ...kg, unidad: "contenedor20", tarifa_usd: 110.31 };
    assert.equal(totalServicioUsd([{ tipo_despacho: "kg", cantidad: 2750 }, { tipo_despacho: "contenedor20", cantidad: 2 }], [kg, contenedor]), 308.86);
  });
});