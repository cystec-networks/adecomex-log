import { describe, expect, it } from "vitest";
import { accionLimiteIa, topeBloquea } from "./ia-consumo";

describe("límites diarios de IA", () => {
  it("las funciones de correo solo alertan por defecto", () => {
    expect(accionLimiteIa("correo_adjunto", null)).toBe("alerta");
    expect(accionLimiteIa("correo_clasificacion", undefined)).toBe("alerta");
    expect(accionLimiteIa("correo_pagina", null)).toBe("alerta");
    expect(accionLimiteIa("correo_texto", null)).toBe("alerta");
  });
  it("las demás funciones se detienen por defecto", () => {
    expect(accionLimiteIa("asistente", null)).toBe("bloqueo");
    expect(accionLimiteIa("documento_expediente", null)).toBe("bloqueo");
  });
  it("la acción elegida por el administrador prevalece", () => {
    expect(accionLimiteIa("correo_adjunto", "bloqueo")).toBe("bloqueo");
    expect(accionLimiteIa("asistente", "alerta")).toBe("alerta");
  });
  it("un límite de correos alcanzado no detiene la lectura salvo que se elija Detener", () => {
    expect(topeBloquea("correo_adjunto", 5, 5, null)).toBe(false);
    expect(topeBloquea("correo_adjunto", 5, 5, "bloqueo")).toBe(true);
    expect(topeBloquea("correo_adjunto", 4.99, 5, "bloqueo")).toBe(false);
    expect(topeBloquea("asistente", 1, 1, null)).toBe(true);
  });
});
