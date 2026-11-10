import { describe, expect, it } from "vitest";
import { correoAtascado, esFalloCorreo } from "./correos-recibidos";

const ahora = Date.parse("2026-11-10T12:00:00Z");
describe("alertas de correos recibidos", () => {
  it("un correo procesando más de 10 minutos cuenta como fallo", () => {
    expect(correoAtascado({ resultado: "procesando", ultimo_intento_at: "2026-11-10T11:49:00Z" }, ahora)).toBe(true);
    expect(correoAtascado({ resultado: "procesando", ultimo_intento_at: "2026-11-10T11:55:00Z" }, ahora)).toBe(false);
  });
  it("error siempre es fallo; resultados correctos nunca", () => {
    expect(esFalloCorreo({ resultado: "error", ultimo_intento_at: "2026-11-10T11:59:00Z" }, ahora)).toBe(true);
    for (const resultado of ["creada", "adjuntada", "descartada", "actualizada"]) expect(esFalloCorreo({ resultado, ultimo_intento_at: "2026-11-10T10:00:00Z" }, ahora)).toBe(false);
  });
});
