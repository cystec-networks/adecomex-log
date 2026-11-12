import { describe, expect, it } from "vitest";
import { correosPorTurno, ordenCola, textoCola } from "./correos-cola";

describe("cola de correos por IA", () => {
  it("responde el resultado acordado al script", () => {
    expect(textoCola("limite_ia")).toBe("en cola por límite de IA");
    expect(textoCola("creditos_ia")).toBe("en cola por créditos de IA agotados");
  });
  it("con el límite vigente no procesa; sin créditos solo uno de prueba; sin pausa, el máximo", () => {
    expect(correosPorTurno("limite_ia", 3)).toBe(0);
    expect(correosPorTurno("creditos_ia", 3)).toBe(1);
    expect(correosPorTurno(null, 3)).toBe(3);
  });
  it("procesa en orden de llegada", () => {
    const filas = [
      { id: "b", primer_intento_at: "2026-11-12T10:05:00Z" },
      { id: "a", primer_intento_at: "2026-11-12T09:00:00Z" },
      { id: "c", primer_intento_at: "2026-11-12T10:05:00Z" },
    ];
    expect(ordenCola(filas).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});
