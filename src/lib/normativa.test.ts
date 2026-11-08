import { describe, expect, it } from "vitest";

import {
  analizarTextoPaginas,
  formatearNormativaParaPrompt,
  fragmentarDocumento,
  nombreArchivoSeguro,
  type FragmentoContexto,
} from "./normativa";

const relleno = (n: number) => "Texto de la disposición con contenido normativo suficiente. ".repeat(n);

describe("base normativa", () => {
  it("un PDF sin texto en ninguna página se marca como escaneado", () => {
    expect(analizarTextoPaginas(["", "  \n ", "12"]).escaneado).toBe(true);
    const parcial = analizarTextoPaginas([relleno(3), ""]);
    expect(parcial.escaneado).toBe(false);
    expect(parcial.sinTexto).toBe(1);
  });

  it("cada fragmento conserva su página y su artículo, también si el artículo sigue en la página siguiente", () => {
    const paginas = [
      `LEY NÚM. 168-21 DE ADUANAS\nArtículo 1. Objeto. ${relleno(20)}`,
      `${relleno(20)}\nArtículo 2. Definiciones. ${relleno(5)}`,
    ];
    const f = fragmentarDocumento(paginas, 1500, 100);
    expect(f.length).toBeGreaterThan(1);
    expect(f[0].pagina_inicio).toBe(1);
    expect(f[0].articulo).toBe("Artículo 1");
    // El texto al inicio de la página 2 sigue siendo del artículo 1.
    const continuacion = f.find((x) => x.pagina_inicio === 2);
    expect(continuacion?.articulo).toMatch(/^Artículo/);
    expect(f.some((x) => x.articulo?.includes("2"))).toBe(true);
    expect(f.map((x) => x.orden)).toEqual(f.map((_, i) => i));
  });

  it("no pierde texto: todo el contenido de las páginas legibles queda en algún fragmento", () => {
    const paginas = ["Art. 5.- Las mercancías deberán declararse. " + relleno(60)];
    const f = fragmentarDocumento(paginas, 800, 100);
    expect(f.every((x) => x.contenido.length <= 800)).toBe(true);
    expect(f[0].contenido.startsWith("Art. 5")).toBe(true);
    expect(f[f.length - 1].contenido.endsWith("suficiente.")).toBe(true);
  });

  it("el bloque del asistente advierte la vigencia y omite fragmentos poco parecidos", () => {
    const base: FragmentoContexto = {
      titulo: "Ley de Aduanas",
      tipo: "Ley",
      numero: "168-21",
      fecha_emision: "2021-08-10",
      estado_vigencia: "derogado",
      fuente_url: "https://www.aduanas.gob.do/ley",
      pagina_inicio: 3,
      pagina_fin: 4,
      articulo: "Artículo 12",
      contenido: "Texto",
      similitud: 0.8,
    };
    const txt = formatearNormativaParaPrompt([base, { ...base, articulo: "Artículo 99", similitud: 0.1 }]);
    expect(txt).toContain("Vigencia: Derogado");
    expect(txt).toContain("Artículo 12, páginas 3–4");
    expect(txt).toContain("emitido el 10/08/2021");
    expect(txt).not.toContain("Artículo 99");
    expect(formatearNormativaParaPrompt([])).toMatch(/No hay fragmentos/);
    expect(formatearNormativaParaPrompt(null)).toMatch(/No se pudo consultar/);
  });

  it("los nombres de archivo quedan sin acentos ni espacios y terminan en .pdf", () => {
    expect(nombreArchivoSeguro("Resolución núm 5 (2024).PDF")).toBe("Resolucion_num_5_2024_.PDF");
    expect(nombreArchivoSeguro("ley")).toBe("ley.pdf");
  });
});

describe("base normativa · artículos al inicio de página", () => {
  it("un artículo que abre la página siguiente empieza su propio fragmento", () => {
    const paginas = [
      `Artículo 1. Objeto. ${relleno(4)}\nArtículo 2. Plazo. ${relleno(5)}`,
      `Artículo 3. Documentos. ${relleno(3)}`,
    ];
    const f = fragmentarDocumento(paginas);
    const art3 = f.find((x) => x.contenido.startsWith("Artículo 3"));
    expect(art3?.articulo).toBe("Artículo 3");
    expect(art3?.pagina_inicio).toBe(2);
  });
});
