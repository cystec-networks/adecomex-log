import { describe, expect, it } from "vitest";
import { elegirVozEspanol, fragmentosParaVoz, textoParaVoz, VOZ_MAX_FRAGMENTO } from "./asistente-voz";

describe("elegirVozEspanol", () => {
  it("solo elige voces en español", () => {
    expect(elegirVozEspanol([{ lang: "en-US" }, { lang: "fr-FR" }])).toBeNull();
  });

  it("prefiere acento dominicano/latinoamericano antes que España", () => {
    const v = elegirVozEspanol([{ lang: "en-US" }, { lang: "es-ES" }, { lang: "es-MX" }]);
    expect(v?.lang).toBe("es-MX");
    expect(elegirVozEspanol([{ lang: "es-MX" }, { lang: "es-DO" }])?.lang).toBe("es-DO");
  });

  it("acepta cualquier variante de español si no hay preferida", () => {
    expect(elegirVozEspanol([{ lang: "de-DE" }, { lang: "es_GT" }])?.lang).toBe("es_GT");
  });
});

describe("textoParaVoz", () => {
  it("no lee símbolos de Markdown, enlaces ni código", () => {
    const t = textoParaVoz("## Pasos\n\n- **Factura** comercial\n- Ver [guía DGA](https://dga.gov.do)\n\n```js\nx=1\n```");
    expect(t).toBe("Pasos. Factura comercial. Ver guía DGA.");
  });

  it("conserva la numeración de listas", () => {
    expect(textoParaVoz("1. BL\n2) Factura")).toBe("1. BL. 2. Factura.");
  });
});

describe("fragmentosParaVoz", () => {
  it("ningún fragmento supera el máximo y no se pierde texto", () => {
    const texto = Array.from({ length: 40 }, (_, i) => `La frase número ${i} explica un trámite aduanero.`).join(" ");
    const f = fragmentosParaVoz(texto);
    expect(f.length).toBeGreaterThan(1);
    expect(f.every((p) => p.length <= VOZ_MAX_FRAGMENTO)).toBe(true);
    expect(f.join(" ")).toBe(texto);
  });

  it("parte frases muy largas por palabras", () => {
    const larga = "palabra ".repeat(100).trim();
    const f = fragmentosParaVoz(larga, 50);
    expect(f.every((p) => p.length <= 50)).toBe(true);
    expect(f.join(" ")).toBe(larga);
  });
});
