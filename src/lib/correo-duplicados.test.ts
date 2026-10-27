import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inicioVentanaDuplicadoCorreo, ESTADOS_DUPLICADO_CORREO, respuestaCorreoDuplicado } from "./correo-duplicados";

describe("duplicados de solicitudes por correo", () => {
  it("consulta exactamente los últimos cinco minutos", () => {
    assert.equal(inicioVentanaDuplicadoCorreo(Date.parse("2026-10-27T20:35:00Z")), "2026-10-27T20:30:00.000Z");
  });
  it("incluye pendientes y confirmadas, no descartadas", () => {
    assert.deepEqual(ESTADOS_DUPLICADO_CORREO, ["pendiente", "confirmada"]);
  });
  it("ignora el duplicado con HTTP 200 para no provocar reintentos", async () => {
    const respuesta = respuestaCorreoDuplicado();
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).resultado, "duplicado");
  });
});