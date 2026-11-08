import { describe, expect, it } from "vitest";
import {
  elegirVozEspanol,
  esErrorVozEsperado,
  fragmentosParaVoz,
  generoVoz,
  mensajeFalloVoz,
  textoParaVoz,
  VOZ_MAX_FRAGMENTO,
} from "./asistente-voz";

describe("elegirVozEspanol", () => {
  it("solo elige voces en español", () => {
    expect(elegirVozEspanol([{ lang: "en-US" }, { lang: "fr-FR" }])).toBeNull();
  });

  it("prefiere acento dominicano/latinoamericano antes que España", () => {
    const v = elegirVozEspanol([{ lang: "en-US" }, { lang: "es-ES" }, { lang: "es-MX" }]);
    expect(v?.lang).toBe("es-MX");
    expect(elegirVozEspanol([{ lang: "es-MX" }, { lang: "es-DO" }])?.lang).toBe("es-DO");
  });

  it("prioriza voces instaladas en el equipo sobre voces de red", () => {
    const v = elegirVozEspanol([
      { lang: "es-MX", name: "Microsoft Jorge Online (Natural)", localService: false },
      { lang: "es-ES", name: "Microsoft Pablo", localService: true },
    ]);
    expect(v?.name).toBe("Microsoft Pablo");
  });

  it("acepta cualquier variante de español si no hay preferida", () => {
    expect(elegirVozEspanol([{ lang: "de-DE" }, { lang: "es_GT" }])?.lang).toBe("es_GT");
  });

  it("elige una voz masculina aunque la femenina tenga mejor acento o sea predeterminada", () => {
    const v = elegirVozEspanol([
      { lang: "es-DO", name: "Microsoft Ramona Online (Natural) - Spanish (Dominican Republic)", default: true },
      { lang: "es-MX", name: "Paulina" },
      { lang: "es-ES", name: "Jorge" },
    ]);
    expect(v?.name).toBe("Jorge");
  });

  it("reconoce voces masculinas de Windows con acentos en el nombre", () => {
    const v = elegirVozEspanol([
      { lang: "es-ES", name: "Microsoft Helena - Spanish (Spain)", localService: true },
      { lang: "es-ES", name: "Microsoft Álvaro Online (Natural) - Spanish (Spain)", localService: false },
    ]);
    expect(v?.name).toMatch(/Álvaro/);
  });

  it("usa una voz femenina solo si no hay ninguna masculina", () => {
    const v = elegirVozEspanol([
      { lang: "en-US", name: "Microsoft David - English (United States)" },
      { lang: "es-MX", name: "Paulina" },
    ]);
    expect(v?.name).toBe("Paulina");
  });

  it("prefiere una voz de género desconocido antes que una femenina", () => {
    const v = elegirVozEspanol([
      { lang: "es-ES", name: "Mónica" },
      { lang: "es-US", name: "Voz genérica es-US" },
    ]);
    expect(v?.name).toBe("Voz genérica es-US");
  });
});

describe("generoVoz", () => {
  it("no confunde «female» con «male»", () => {
    expect(generoVoz("Spanish Female")).toBe("femenina");
    expect(generoVoz("Spanish Male")).toBe("masculina");
  });

  it("deduce el género por nombres conocidos", () => {
    expect(generoVoz("Diego")).toBe("masculina");
    expect(generoVoz("Microsoft Raul - Spanish (Mexico)")).toBe("masculina");
    expect(generoVoz("Google español")).toBe("desconocido");
    expect(generoVoz("Microsoft Sabina - Spanish (Mexico)")).toBe("femenina");
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

describe("errores de voz", () => {
  it("cancelar o interrumpir no es un fallo", () => {
    expect(esErrorVozEsperado("canceled")).toBe(true);
    expect(esErrorVozEsperado("interrupted")).toBe(true);
    expect(esErrorVozEsperado("synthesis-failed")).toBe(false);
  });

  it("bloqueo del navegador indica pulsar el altavoz", () => {
    expect(mensajeFalloVoz("not-allowed")).toMatch(/altavoz/);
  });
});
