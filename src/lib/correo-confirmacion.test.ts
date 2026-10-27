import { describe, expect, test } from "bun:test";
import { asuntoConfirmacion, copiasConfirmacion, cuerpoConfirmacion, correoConfirmacionSolicitud, faltantesConfirmacion } from "@/lib/correo-confirmacion";

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
  test("prefija REGISTRO # con el número de expediente", () => {
    expect(asuntoConfirmacion(base.numero, base.asunto)).toBe("REGISTRO #202610I388 : HACER VUCE: HBLIWF10012026-2 -- ETA 30/11/2026");
  });
  test("no duplica si el asunto ya trae REGISTRO #", () => {
    expect(asuntoConfirmacion("202610I388", "REGISTRO #202610I388 : HACER VUCE")).toBe("REGISTRO #202610I388 : HACER VUCE");
    expect(asuntoConfirmacion("202610I388", "registro #202610I388 : aviso")).toBe("registro #202610I388 : aviso");
  });
});

describe("copiasConfirmacion", () => {
  test("une destinatarios y CC sin duplicar", () => {
    expect(copiasConfirmacion(base.destinatarios, base.cc)).toBe("ventas@agrolacteos.com, compras@agrolacteos.com, gerencia@agrolacteos.com");
    expect(copiasConfirmacion("a@x.com, b@x.com", "B@x.com; c@x.com")).toBe("a@x.com, b@x.com, c@x.com");
  });
  test("vacío cuando no hay copias", () => {
    expect(copiasConfirmacion(null, undefined)).toBe("");
  });
});

describe("cuerpoConfirmacion", () => {
  test("coincide con la plantilla real del Expediente 202610I388", () => {
    const cuerpo = cuerpoConfirmacion(base);
    expect(cuerpo).toContain("Estimado Cliente: AGROLACTEOS IMANFA SRL.");
    expect(cuerpo).toContain("número de seguimiento: REGISTRO #202610I388, ETA 30/11/2026.");
    expect(cuerpo).toContain("Descripción: 3 CONT. DE LECHE DESCREMADA EN POLVO.");
    expect(cuerpo).toContain("Francisco E. López");
    expect(cuerpo).toContain("operaciones@adecomex.com");
    expect(faltantesConfirmacion(base)).toEqual([]);
  });
  test("resalta ETA y Descripción ausentes para completar a mano", () => {
    const cuerpo = cuerpoConfirmacion({ ...base, eta: null, descripcion: "" });
    expect(cuerpo).toContain("ETA «COMPLETAR: ETA».");
    expect(cuerpo).toContain("Descripción: «COMPLETAR: Descripción».");
    expect(faltantesConfirmacion({ eta: null, descripcion: "" })).toEqual(["ETA", "Descripción"]);
  });
});

describe("correoConfirmacionSolicitud", () => {
  test("abre Gmail con Para, CC, asunto y cuerpo precargados", () => {
    const url = correoConfirmacionSolicitud(base);
    expect(url.startsWith("https://mail.google.com/mail/?")).toBe(true);
    const p = new URLSearchParams(url.split("?")[1]);
    expect(p.get("to")).toBe("cliente@agrolacteos.com");
    expect(p.get("cc")).toBe("ventas@agrolacteos.com, compras@agrolacteos.com, gerencia@agrolacteos.com");
    expect(p.get("su")).toBe("REGISTRO #202610I388 : HACER VUCE: HBLIWF10012026-2 -- ETA 30/11/2026");
    expect(p.get("body")).toContain("REGISTRO #202610I388, ETA 30/11/2026.");
    expect(p.get("authuser")).toBe("operaciones@adecomex.com");
  });
});
