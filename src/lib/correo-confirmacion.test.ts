import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asuntoConfirmacion, copiasConfirmacion, cuerpoConfirmacion, correoConfirmacionSolicitud, faltantesConfirmacion } from "./correo-confirmacion";

const base = {
  numero: "202610I388",
  cliente: "AGROLACTEOS IMANFA SRL",
  eta: "2026-11-30",
  descripcion: "3 CONT. DE LECHE DESCREMADA EN POLVO",
  remitente: "cliente@agrolacteos.com",
  asunto: "HACER VUCE: HBLIWF10012026-2 -- ETA 30/11/2026",
  destinatarios: "ventas@agrolacteos.com, compras@agrolacteos.com",
  cc: "gerencia@agrolacteos.com",
};

describe("asuntoConfirmacion", () => {
  it("prefija REGISTRO # con el número de expediente", () => {
    assert.equal(asuntoConfirmacion(base.numero, base.asunto), "REGISTRO #202610I388 : HACER VUCE: HBLIWF10012026-2 -- ETA 30/11/2026");
  });
  it("no duplica si el asunto ya trae REGISTRO #", () => {
    assert.equal(asuntoConfirmacion("202610I388", "REGISTRO #202610I388 : HACER VUCE"), "REGISTRO #202610I388 : HACER VUCE");
    assert.equal(asuntoConfirmacion("202610I388", "registro #202610I388 : aviso"), "registro #202610I388 : aviso");
  });
});

describe("copiasConfirmacion", () => {
  it("une destinatarios y CC sin duplicar", () => {
    assert.equal(copiasConfirmacion(base.destinatarios, base.cc), "ventas@agrolacteos.com, compras@agrolacteos.com, gerencia@agrolacteos.com");
    assert.equal(copiasConfirmacion("a@x.com, b@x.com", "B@x.com; c@x.com"), "a@x.com, b@x.com, c@x.com");
  });
  it("vacío cuando no hay copias", () => {
    assert.equal(copiasConfirmacion(null, undefined), "");
  });
});

describe("cuerpoConfirmacion", () => {
  it("coincide con la plantilla real del Expediente 202610I388", () => {
    const cuerpo = cuerpoConfirmacion(base);
    assert.ok(cuerpo.includes("Estimado Cliente: AGROLACTEOS IMANFA SRL."));
    assert.ok(cuerpo.includes("número de seguimiento: REGISTRO #202610I388, ETA 30/11/2026."));
    assert.ok(cuerpo.includes("Descripción: 3 CONT. DE LECHE DESCREMADA EN POLVO."));
    assert.ok(cuerpo.includes("Francisco E. López"));
    assert.ok(cuerpo.includes("operaciones@adecomex.com"));
    assert.deepEqual(faltantesConfirmacion(base), []);
  });
  it("resalta ETA y Descripción ausentes para completar a mano", () => {
    const cuerpo = cuerpoConfirmacion({ ...base, eta: null, descripcion: "" });
    assert.ok(cuerpo.includes("ETA «COMPLETAR: ETA»."));
    assert.ok(cuerpo.includes("Descripción: «COMPLETAR: Descripción»."));
    assert.deepEqual(faltantesConfirmacion({ eta: null, descripcion: "" }), ["ETA", "Descripción"]);
  });
});

describe("correoConfirmacionSolicitud", () => {
  it("abre Gmail con Para, CC, asunto y cuerpo precargados", () => {
    const url = correoConfirmacionSolicitud(base);
    assert.ok(url.startsWith("https://mail.google.com/mail/?"));
    const p = new URLSearchParams(url.split("?")[1]);
    assert.equal(p.get("to"), "cliente@agrolacteos.com");
    assert.equal(p.get("cc"), "ventas@agrolacteos.com, compras@agrolacteos.com, gerencia@agrolacteos.com");
    assert.equal(p.get("su"), "REGISTRO #202610I388 : HACER VUCE: HBLIWF10012026-2 -- ETA 30/11/2026");
    assert.ok(p.get("body")!.includes("REGISTRO #202610I388, ETA 30/11/2026."));
    assert.equal(p.get("authuser"), "operaciones@adecomex.com");
  });
});
