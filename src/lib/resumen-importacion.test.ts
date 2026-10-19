import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumenImportacion } from "./resumen-importacion";

const TASA = 60;

describe("resumenImportacion — pestaña Costos, solo lectura", () => {
  it("suma los impuestos Real (US$) convertidos a RD$ con la tasa del expediente", () => {
    const r = resumenImportacion({
      filas: [
        { gravamen_real: 100, isc_real: 10, itbis_real: 180 },
        { gravamen_real: 50, isc_real: 5, itbis_real: 90 },
      ],
      tasa: TASA,
      costoMercanciaRd: 30000,
    });
    assert.equal(r.gravamen.rd, 9000);
    assert.equal(r.isc.rd, 900);
    assert.equal(r.itbis.rd, 16200);
    assert.equal(r.totalGeneral, 9000 + 900 + 30000); // sin ITBIS
    assert.ok(r.gravamen.capturado && r.isc.capturado && r.itbis.capturado);
  });

  it("un impuesto sin capturar en todas las líneas reporta pendiente, no 0.00", () => {
    const r = resumenImportacion({
      filas: [{ gravamen_real: 100, isc_real: null, itbis_real: 180 }],
      tasa: TASA,
      costoMercanciaRd: 30000,
    });
    assert.ok(!r.isc.capturado);
    assert.equal(r.isc.rd, 0);
    assert.ok(r.pendientes);
    assert.equal(r.totalGeneral, null); // falta ISC: total pendiente
    assert.ok(r.gravamen.capturado && r.itbis.capturado);
  });

  it("ITBIS capturado en 0 (exento) cuenta como capturado y no bloquea el total", () => {
    const r = resumenImportacion({
      filas: [{ gravamen_real: 100, isc_real: 10, itbis_real: 0 }],
      tasa: TASA,
      costoMercanciaRd: 0,
    });
    assert.ok(r.itbis.capturado);
    assert.equal(r.itbis.rd, 0);
    assert.equal(r.totalGeneral, 6000 + 600);
  });

  it("sin filas todo queda pendiente", () => {
    const r = resumenImportacion({ filas: [], tasa: TASA, costoMercanciaRd: 100 });
    assert.ok(!r.gravamen.capturado && !r.isc.capturado && !r.itbis.capturado);
    assert.ok(r.pendientes);
    assert.equal(r.totalGeneral, null);
  });

  it("sin tasa de cambio con impuestos capturados no inventa conversiones", () => {
    const r = resumenImportacion({
      filas: [{ gravamen_real: 100, isc_real: 10, itbis_real: 0 }],
      tasa: 0,
      costoMercanciaRd: 5000,
    });
    assert.ok(r.sinTasa);
    assert.equal(r.totalGeneral, null);
  });
});
