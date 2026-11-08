import { describe, expect, it } from "vitest";

import {
  analizarTextoPaginas,
  detectarDatosDocumento,
  formatearFichasNormativaParaPrompt,
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

describe("detección de número y fecha de emisión", () => {
  const HOY = new Date("2026-11-08T12:00:00Z");
  const cuerpo = relleno(4);

  it("ley: número del encabezado y fecha de promulgación del cierre (no las de las cámaras)", () => {
    const paginas = [
      `LEY NÚM. 168-21\nLEY GENERAL DE ADUANAS\nVISTA: La Ley núm. 3489 del 14 de febrero de 1953.\n${cuerpo}`,
      cuerpo,
      `DADA en la Sala de Sesiones del Senado a los diez (10) días del mes de junio del año dos mil veintiuno (2021).\nDADA en Santo Domingo de Guzmán, a los nueve (9) días del mes de agosto del año dos mil veintiuno (2021).\n${cuerpo}`,
    ];
    expect(detectarDatosDocumento(paginas, "Ley", HOY)).toEqual({ numero: "168-21", fecha_emision: "2021-08-09" });
  });

  it("norma general con nombre intermedio y fecha simple en el encabezado", () => {
    const paginas = [`Santo Domingo, 15 de enero de 2026\nNORMA GENERAL SOBRE FACTURACIÓN No. 07-2018\n${cuerpo}`, cuerpo];
    expect(detectarDatosDocumento(paginas, "Norma general", HOY)).toEqual({ numero: "07-2018", fecha_emision: "2026-01-15" });
  });

  it("resolución con prefijo de institución y fecha numérica", () => {
    const paginas = [`RESOLUCIÓN DGA-001-2024\n${cuerpo}`, `Dada el 03/04/2024.\n${cuerpo}`];
    expect(detectarDatosDocumento(paginas, "Resolución", HOY)).toEqual({ numero: "DGA-001-2024", fecha_emision: "2024-04-03" });
  });

  it("sin datos reconocibles no inventa nada; fechas futuras o imposibles se descartan", () => {
    expect(detectarDatosDocumento([`Guía práctica de importación\n${cuerpo}`], "Guía", HOY)).toEqual({ numero: null, fecha_emision: null });
    expect(detectarDatosDocumento([`Decreto 12-27 del 31 de febrero de 2027\n${cuerpo}`], "Decreto", HOY).fecha_emision).toBeNull();
    expect(detectarDatosDocumento([], "Ley", HOY)).toEqual({ numero: null, fecha_emision: null });
  });

  it("decreto real escaneado: «NÚMERO: 755-22» y fecha con espacios y «a110» del reconocimiento de texto", () => {
    const paginas = [
      `L U I S A B I N A D E R\nNÚMERO: 755-22\nCONSIDERANDO: Que el 9 de agosto de202 l fue promulgada la Ley núm. 1 6 8 - 2 1 , de Aduanas\n${cuerpo}`,
      cuerpo,
      `ARTÍCULO 318. Envíese a las instituciones correspondientes.\nDADO en la ciudad de Santo Domingo de Guzmán, Distrito Nacional, a los veintitrés ( 23 )dias del mes de diciembre del a110 dos mil\nveintidós (2022); año 179 de la Independencia.\n${cuerpo}`,
    ];
    expect(detectarDatosDocumento(paginas, "Decreto", HOY)).toEqual({ numero: "755-22", fecha_emision: "2022-12-23" });
  });

  it("un número suelto de una o dos cifras no se toma como número del documento", () => {
    expect(detectarDatosDocumento([`Circular 3 a los importadores\n${cuerpo}`], "Circular", HOY).numero).toBeNull();
  });

  it("las fichas avisan si el documento aún se procesa y si los datos están sin confirmar", () => {
    const texto = formatearFichasNormativaParaPrompt([
      {
        titulo: "Ley General de Aduanas",
        tipo: "Ley",
        numero: "168-21",
        numero_detectado: true,
        fecha_emision: "2021-08-09",
        fecha_emision_detectada: false,
        estado_vigencia: "vigente",
        procesamiento_estado: "procesando",
        fragmentos_total: 120,
        fragmentos_listos: 40,
        fuente_url: null,
      },
    ]);
    expect(texto).toContain("Número: 168-21 (detectado automáticamente, sin confirmar)");
    expect(texto).toContain("Fecha de emisión: 09/08/2021 |");
    expect(texto).toContain("AÚN SE ESTÁ PROCESANDO (40 de 120 fragmentos listos)");
    expect(formatearFichasNormativaParaPrompt([])).toContain("no tiene documentos");
  });
});
