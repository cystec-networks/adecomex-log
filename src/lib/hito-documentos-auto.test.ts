import { describe, expect, it } from "vitest";
import { esHitoAutomatico, fechaCorreoValida, PARCHE_EDICION_MANUAL, textoHitoAutomatico } from "./hito-documentos-auto";

describe("hito Documentos digitales recibidos", () => {
  it("muestra la hora de Santo Domingo del correo original", () => {
    // 13:45 UTC = 09:45 en Santo Domingo (UTC-4)
    expect(textoHitoAutomatico({ auto_origen: "correo", auto_fecha: "2026-11-10T13:45:00Z" })).toBe("Correo recibido el 10/11/2026 09:45");
  });

  it("sin correo usa la primera carga de documentos", () => {
    expect(textoHitoAutomatico({ auto_origen: "documentos", auto_fecha: "2026-11-12T20:05:00Z" })).toBe("Primera carga de documentos el 12/11/2026 16:05");
  });

  it("una fecha editada a mano no lleva la etiqueta Automático", () => {
    expect(esHitoAutomatico({ auto_origen: "manual", auto_fecha: null })).toBe(false);
    expect(esHitoAutomatico({ auto_origen: null, auto_fecha: null })).toBe(false);
    expect(esHitoAutomatico({ auto_origen: "correo", auto_fecha: "2026-11-10T13:45:00Z" })).toBe(true);
  });

  it("editar a mano marca el hito como manual para que no se vuelva a llenar solo", () => {
    expect(PARCHE_EDICION_MANUAL.auto_origen).toBe("manual");
    expect(PARCHE_EDICION_MANUAL.auto_fecha).toBeNull();
  });

  it("acepta la fecha ISO del script y rechaza valores inválidos o futuros", () => {
    const ahora = Date.parse("2026-11-12T21:00:00Z");
    expect(fechaCorreoValida("2026-11-10T13:45:00.000Z", ahora)).toBe("2026-11-10T13:45:00.000Z");
    expect(fechaCorreoValida("no es fecha", ahora)).toBeNull();
    expect(fechaCorreoValida("2026-11-20T00:00:00Z", ahora)).toBeNull();
    expect(fechaCorreoValida(undefined, ahora)).toBeNull();
  });
});
