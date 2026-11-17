import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { casillaOcupada, codigoParaNuevoTipo, diasParaRestaurar, lectorDeTipo, puedeRestaurar } from "./documentos-papelera";

describe("Papelera de documentos: restaurable durante 30 días", () => {
  const eliminado = "2026-11-17T21:00:00Z";
  it("se puede restaurar el día 30", () => {
    assert.equal(puedeRestaurar(eliminado, new Date("2026-12-17T20:59:00Z")), true);
  });
  it("después de 30 días ya no se puede restaurar", () => {
    assert.equal(puedeRestaurar(eliminado, new Date("2026-12-17T21:01:00Z")), false);
  });
  it("cuenta los días que quedan", () => {
    assert.equal(diasParaRestaurar(eliminado, new Date("2026-11-17T21:05:00Z")), 30);
    assert.equal(diasParaRestaurar(eliminado, new Date("2026-11-18T21:00:00Z")), 29);
  });
});

describe("Cambiar tipo de documento", () => {
  it("DUA (OTD-001) a Liquidación conserva el código", () => {
    assert.deepEqual(codigoParaNuevoTipo("OTD-001", "Reporte de Liquidación de Impuestos"), { conservar: true });
  });
  it("un OTD movido a Factura comercial necesita un código FAC nuevo", () => {
    assert.deepEqual(codigoParaNuevoTipo("OTD-004", "Factura comercial"), { conservar: false, prefijo: "FAC" });
  });
  it("sin código sigue sin código", () => {
    assert.deepEqual(codigoParaNuevoTipo(null, "Factura comercial"), { conservar: true });
  });
  it("relee con el lector del nuevo tipo", () => {
    assert.equal(lectorDeTipo("Reporte de Liquidación de Impuestos"), "dua");
    assert.equal(lectorDeTipo("Recibo Pago de Impuestos"), "recibo");
    assert.equal(lectorDeTipo("Seguimiento SIGA (Estado de Desaduanización)"), "siga");
    assert.equal(lectorDeTipo("DUA"), null);
  });
  it("no mueve a una casilla fija que ya tiene archivo", () => {
    const unicas = new Set(["Reporte de Liquidación de Impuestos"]);
    assert.equal(casillaOcupada("Reporte de Liquidación de Impuestos", unicas, new Set(["Reporte de Liquidación de Impuestos"])), true);
    assert.equal(casillaOcupada("Reporte de Liquidación de Impuestos", unicas, new Set(["DUA"])), false);
    assert.equal(casillaOcupada("Otro (Liquidación)", unicas, new Set(["Otro (Liquidación)"])), false);
  });
});

import { describirAuditoria } from "./documento-versiones";
describe("Auditoría de Papelera y cambio de tipo", () => {
  it("describe el envío a la Papelera con archivo y motivo", () => {
    assert.equal(describirAuditoria({ accion: "documento_enviado_papelera", entidad: "documentos", cambios: { tipo: "DUA", codigo_siga: "OTD-001", archivo: "LIQ.pdf", motivo: "casilla equivocada" } }),
      "Documento enviado a la Papelera: DUA (OTD-001) «LIQ.pdf» · Motivo: casilla equivocada");
  });
  it("describe el cambio de tipo", () => {
    assert.equal(describirAuditoria({ accion: "documento_tipo_cambiado", entidad: "documentos", cambios: { tipo_anterior: "DUA", codigo_anterior: "OTD-001", tipo: "Reporte de Liquidación de Impuestos", codigo_siga: "OTD-001", archivo: "LIQ.pdf" } }),
      "Tipo de documento cambiado: DUA (OTD-001) → Reporte de Liquidación de Impuestos (OTD-001) «LIQ.pdf» · sin versión nueva");
  });
});
