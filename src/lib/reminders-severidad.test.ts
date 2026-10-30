import { describe, expect, it } from "vitest";
import { severidadEtaProximo } from "./reminders";

// Regla del panel: ETA en 1 o 2 días = ALTA; 3 días o más = MEDIA.
describe("severidadEtaProximo", () => {
  it("marca ALTA con 1 día", () => {
    expect(severidadEtaProximo(1)).toBe("alta");
  });
  it("marca ALTA con 2 días (antes salía MEDIA)", () => {
    expect(severidadEtaProximo(2)).toBe("alta");
  });
  it("marca MEDIA con 3 días", () => {
    expect(severidadEtaProximo(3)).toBe("media");
  });
  it("marca MEDIA con más días", () => {
    expect(severidadEtaProximo(7)).toBe("media");
  });
});
