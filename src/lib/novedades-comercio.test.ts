import { describe, expect, it } from "vitest";

import {
  claveUrl,
  esFeed,
  extraerEnlacesListado,
  fechaIso,
  formatearNovedadesParaPrompt,
  intentoExitoso,
  palabrasClave,
  parsearFeed,
  patronIntentos,
  textoFechaNovedad,
} from "./novedades-comercio";

describe("novedades de comercio exterior", () => {
  it("la clave de enlace ignora esquema, www, fragmento y barra final (evita duplicados)", () => {
    expect(claveUrl("https://www.aduanas.gob.do/noticias/abc/#x")).toBe(
      "aduanas.gob.do/noticias/abc",
    );
    expect(claveUrl("http://aduanas.gob.do/noticias/abc")).toBe(
      claveUrl("https://www.aduanas.gob.do/noticias/abc/"),
    );
  });

  it("interpreta fechas RSS, ISO y dd/mm/aaaa", () => {
    expect(fechaIso("Fri, 06 Nov 2026 14:00:00 +0000")).toBe("2026-11-06");
    expect(fechaIso("2026-10-19T08:00:00-04:00")).toBe("2026-10-19");
    expect(fechaIso("DGII recauda RD$83,680.6 millones 06/11/2026")).toBe("2026-11-06");
    expect(fechaIso("31/02/2026")).toBeNull();
  });

  it("lee las entradas de un canal RSS", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Nueva norma de importación]]></title>
      <link>https://micm.gob.do/nueva-norma/</link><pubDate>Thu, 05 Nov 2026 10:00:00 +0000</pubDate>
      <description>&lt;p&gt;Detalle&lt;/p&gt;</description></item></channel></rss>`;
    expect(esFeed("application/rss+xml", xml)).toBe(true);
    expect(parsearFeed(xml, "https://micm.gob.do/feed/")).toEqual([
      {
        titulo: "Nueva norma de importación",
        url: "https://micm.gob.do/nueva-norma/",
        fecha: "2026-11-05",
        extracto: "Detalle",
      },
    ]);
  });

  it("prefiere los enlaces bajo la ruta del listado y descarta menús y otros sitios", () => {
    const html = `<a href="/">Inicio de la Dirección General de Aduanas</a>
      <a href="/noticias/dga-firma-convenio-con-itla-para-impulsar-capital/">DGA firma convenio con ITLA para impulsar su capital humano</a>
      <a href="/noticias/aduanas-cierra-octubre-record/">Aduanas cierra octubre como el mes de mayor recaudación</a>
      <a href="/noticias/dga-y-cbp-firman-convenio/">DGA y CBP firman convenio para reforzar la seguridad del comercio</a>
      <a href="/sobre-nosotros/politica-de-cumplimiento/">Politica de Cumplimiento y Antisoborno de la institución</a>
      <a href="https://otro.gob.do/noticias/x">Noticia de otro sitio que no corresponde a la fuente</a>`;
    const r = extraerEnlacesListado(html, "https://www.aduanas.gob.do/noticias/");
    expect(r.map((c) => c.url)).toEqual([
      "https://www.aduanas.gob.do/noticias/dga-firma-convenio-con-itla-para-impulsar-capital/",
      "https://www.aduanas.gob.do/noticias/aduanas-cierra-octubre-record/",
      "https://www.aduanas.gob.do/noticias/dga-y-cbp-firman-convenio/",
    ]);
  });

  it("toma la fecha del texto del enlace (formato DGII) y la quita del título", () => {
    const html = ["a", "b", "c"]
      .map(
        (x) =>
          `<a href="http://dgii.gov.do/noticias/Paginas/${x}.aspx">DGII recauda RD$83,680.6 millones en octubre ${x} 06/11/2026</a>`,
      )
      .join("");
    const [c] = extraerEnlacesListado(html, "https://dgii.gov.do/noticias/Paginas/default.aspx");
    expect(c.fecha).toBe("2026-11-06");
    expect(c.titulo).toBe("DGII recauda RD$83,680.6 millones en octubre a");
  });

  it("el contexto del asistente incluye fuente, fecha y enlace de cada novedad", () => {
    const t = formatearNovedadesParaPrompt([
      {
        titulo: "Aviso VUCE",
        resumen: "Nuevo servicio de drones.",
        fecha_publicacion: "2026-06-01",
        fecha_captura: "2026-11-08T10:00:00Z",
        fuente_nombre: "VUCE",
        url: "https://vucerd.gob.do/a.pdf",
        categoria: "Permisos/VUCE",
      },
      {
        titulo: "Sin fecha",
        resumen: "Resumen.",
        fecha_publicacion: null,
        fecha_captura: "2026-11-08T10:00:00Z",
        fuente_nombre: "DGA",
        url: "https://aduanas.gob.do/x",
        categoria: "Aduanas",
      },
    ]);
    expect(t).toContain("Fuente: VUCE | publicada el 01/06/2026");
    expect(t).toContain("Enlace: https://vucerd.gob.do/a.pdf");
    expect(t).toContain(
      "fecha de publicación no disponible; registrada en la plataforma el 08/11/2026",
    );
    expect(t).not.toContain("publicada el 08/11/2026");
    expect(formatearNovedadesParaPrompt([])).toBe("(No hay novedades registradas.)");
  });

  it("extrae palabras útiles de la pregunta", () => {
    expect(palabrasClave("¿Qué novedades hay sobre el marbete de la DGII?")).toEqual([
      "marbete",
      "dgii",
    ]);
  });

  it("sin fecha de publicación dice que no está disponible y usa el día de registro en Santo Domingo", () => {
    expect(textoFechaNovedad("2026-06-01", "2026-11-08T10:00:00Z")).toBe("publicada el 01/06/2026");
    // 02:30 UTC del 9 de noviembre es todavía 8 de noviembre en Santo Domingo.
    expect(textoFechaNovedad(null, "2026-11-09T02:30:00Z")).toBe(
      "fecha de publicación no disponible; registrada en la plataforma el 08/11/2026",
    );
  });

  it("el historial distingue fuentes estables, intermitentes y que siempre fallan", () => {
    expect(intentoExitoso("ok")).toBe(true);
    expect(intentoExitoso("sin_novedades")).toBe(true);
    expect(intentoExitoso("no_legible")).toBe(false);
    expect(patronIntentos([]).patron).toBe("sin_datos");
    expect(patronIntentos([{ exito: true }, { exito: true }]).patron).toBe("estable");
    expect(patronIntentos([{ exito: false }, { exito: true }, { exito: false }])).toEqual({
      patron: "intermitente",
      total: 3,
      fallos: 2,
    });
    expect(patronIntentos([{ exito: false }, { exito: false }]).patron).toBe("siempre_falla");
  });
});
