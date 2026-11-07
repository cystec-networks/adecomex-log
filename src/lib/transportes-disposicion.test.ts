import { describe, expect, it } from "vitest";
import { COLUMNAS_TRANSPORTES_IDS, KPI_TRANSPORTES_IDS, celdasFilaTotales } from "./transportes-disposicion";
import { moverEnOrden, normalizarOrden } from "./orden-preferencia";
import { gananciaPorTransporte, totalesPeriodoTransportes } from "./transporte-ganancia";

describe("Total Pagado del viaje (Monto Neto a Pagar del comprobante)", () => {
  it("TR-000067: 73,600 − 2,500 = 71,100", () => {
    const m = gananciaPorTransporte(
      [{ id: "T67" }],
      [{ id: "s", transporte_id: "T67", cantidad_viajes: 5, precio_viaje: 16000, porcentaje_margen: 8, monto: 80000, descuento_cxc: 2500, moneda: "DOP" }],
    );
    expect(m.get("T67")?.netoPagar).toBe(71100);
  });

  it("varias solicitudes del viaje suman su neto y las anuladas no cuentan", () => {
    const m = gananciaPorTransporte(
      [{ id: "A" }],
      [
        { id: "s1", transporte_id: "A", monto: 10000, descuento_cxc: 1000, moneda: "DOP" },
        { id: "s2", transporte_id: "A", monto: 5000, moneda: "DOP" },
        { id: "s3", transporte_id: "A", monto: 99999, moneda: "DOP", estado: "anulada" },
      ],
    );
    expect(m.get("A")?.netoPagar).toBe(14000);
  });
});

describe("totales del período (recuadros)", () => {
  it("suma flete, pagado, ganancia y descuento por moneda", () => {
    const viajes = [
      { id: "A", flete_monto: 71100, flete_moneda: "DOP" },
      { id: "B", flete_monto: "42660", flete_moneda: "DOP" },
      { id: "C", flete_monto: 500, flete_moneda: "USD" },
    ];
    const g = gananciaPorTransporte(viajes, [
      { id: "s1", transporte_id: "A", cantidad_viajes: 5, precio_viaje: 16000, porcentaje_margen: 8, descuento_cxc: 2500, moneda: "DOP" },
      { id: "s2", transporte_id: "B", cantidad_viajes: 3, precio_viaje: 16000, porcentaje_margen: 8, descuento_cxc: 1500, moneda: "DOP" },
    ]);
    const t = Object.fromEntries(totalesPeriodoTransportes(viajes, g));
    expect(t.DOP).toEqual({ flete: 113760, pagado: 113760, ganancia: 10240, descuentoCxc: 4000 });
    expect(t.USD).toEqual({ flete: 500, pagado: 0, ganancia: 0, descuentoCxc: 0 });
  });

  it("sin viajes en el período muestra ceros en DOP", () => {
    expect(totalesPeriodoTransportes([], new Map())).toEqual([["DOP", { flete: 0, pagado: 0, ganancia: 0, descuentoCxc: 0 }]]);
  });
});

describe("orden por usuario de recuadros y columnas", () => {
  it("sin preferencia usa el orden por defecto con Total Pagado tras Flete", () => {
    const orden = normalizarOrden(null, COLUMNAS_TRANSPORTES_IDS);
    expect(orden.indexOf("pagado")).toBe(orden.indexOf("flete") + 1);
    expect(normalizarOrden(null, KPI_TRANSPORTES_IDS)).toEqual(["flete", "pagado", "ganancia", "descuento-cxc"]);
  });

  it("un orden guardado sin columnas nuevas las agrega al final sin perder el orden del usuario", () => {
    const orden = normalizarOrden(["estado", "numero_viaje", "inventada"], COLUMNAS_TRANSPORTES_IDS);
    expect(orden.slice(0, 2)).toEqual(["estado", "numero_viaje"]);
    expect(orden).toHaveLength(COLUMNAS_TRANSPORTES_IDS.length);
  });

  it("arrastrar Ganancia sobre Total Flete la deja primera", () => {
    expect(moverEnOrden([...KPI_TRANSPORTES_IDS], "ganancia", "flete")).toEqual(["ganancia", "flete", "pagado", "descuento-cxc"]);
  });

  it("la fila de totales sigue a sus columnas cuando se reordenan", () => {
    const celdas = celdasFilaTotales(["ganancia", "numero_viaje", "cliente", "flete", "estado"]);
    expect(celdas).toEqual([
      { tipo: "total", id: "ganancia" },
      { tipo: "etiqueta", colSpan: 2 },
      { tipo: "total", id: "flete" },
      { tipo: "vacia", colSpan: 1 },
    ]);
  });
});
