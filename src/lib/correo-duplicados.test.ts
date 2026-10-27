import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mismoPendienteCorreo, respuestaCorreoActualizado } from "./correo-duplicados";

describe("duplicados de solicitudes por correo", () => {
  const anterior = { remitente: "ADECOMEX SRL <adecomexsa@gmail.com>", remitente_correo: "adecomexsa@gmail.com", asunto: "HACER VUCE", bl_awb: "HBLIWF10012026-2", estado: "pendiente", created_at: "2026-10-27T22:17:14Z" };
  it("mismo remitente y BL pendiente coincide 24 minutos después aunque cambie asunto", () => {
    assert.equal(mismoPendienteCorreo(anterior, { ...anterior, asunto: "Fwd: HACER VUCE", created_at: "2026-10-27T22:41:14Z" } as typeof anterior), true);
  });
  it("no incluye confirmadas ni descartadas", () => {
    for (const estado of ["confirmada", "descartada"]) assert.equal(mismoPendienteCorreo({ ...anterior, estado }, anterior), false);
  });
  it("ambos BL vacíos usan asunto exacto sin límite de tiempo", () => {
    assert.equal(mismoPendienteCorreo({ ...anterior, bl_awb: null }, { ...anterior, bl_awb: "" }), true);
    assert.equal(mismoPendienteCorreo({ ...anterior, bl_awb: null }, { ...anterior, bl_awb: null, asunto: "Fwd: HACER VUCE" }), false);
  });
  it("no fusiona BL distintos ni un BL vacío con otro conocido", () => {
    for (const bl_awb of [null, "OTRO-BL"]) assert.equal(mismoPendienteCorreo(anterior, { ...anterior, bl_awb }), false);
  });
  it("no fusiona remitentes diferentes", () => {
    assert.equal(mismoPendienteCorreo(anterior, { ...anterior, remitente_correo: "otro@example.com" }), false);
  });
  it("actualizar el duplicado responde HTTP 200 para no provocar reintentos", async () => {
    const respuesta = respuestaCorreoActualizado("d671ad07-0a0e-4c0b-977b-d86b24d69698");
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).resultado, "actualizado");
  });
});