import { describe, expect, it } from "vitest";

import {
  abreEnVisorPdf,
  claveDocumento,
  esMismoDocumento,
  mismoContenido,
  sha256Contenido,
  claveUrl,
  estadoEnlacePorCodigo,
  normalizarUrlNovedad,
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

  it("el mismo aviso publicado en otra carpeta de VUCE es duplicado (mismo documento)", () => {
    const a = "https://vucerd.gob.do/media/2415/aviso-importante-entr%C3%B3-en-vigor-el-formulario-de-importancion-de-az%C3%BAcar.pdf";
    const b = "https://www.vucerd.gob.do/media/2434/aviso-importante-entr%C3%B3-en-vigor-el-formulario-de-importancion-de-az%C3%BAcar.pdf";
    expect(claveUrl(a)).not.toBe(claveUrl(b));
    expect(claveDocumento(a)).toBe(claveDocumento(b));
    expect(claveDocumento(a)).toBe(
      "vucerd.gob.do/aviso-importante-entr%c3%b3-en-vigor-el-formulario-de-importancion-de-az%c3%bacar.pdf",
    );
  });

  it("no une documentos distintos ni páginas web por la clave de documento", () => {
    expect(claveDocumento("https://vucerd.gob.do/media/1/aviso.pdf")).toBeNull();
    expect(claveDocumento("https://aduanas.gob.do/noticias/aviso-importante-de-aduanas/")).toBeNull();
    expect(claveDocumento("https://vucerd.gob.do/media/1/aviso-importante-uno.pdf")).not.toBe(
      claveDocumento("https://vucerd.gob.do/media/2/aviso-importante-dos.pdf"),
    );
  });

  it("normaliza el enlace: absoluto, sin espacios y con acentos codificados", () => {
    expect(normalizarUrlNovedad(" https://vucerd.gob.do/media/9/aviso azúcar.pdf ")).toBe(
      "https://vucerd.gob.do/media/9/aviso%20az%C3%BAcar.pdf",
    );
    expect(normalizarUrlNovedad("https://vucerd.gob.do/media/9/az%C3%BAcar.pdf")).toBe(
      "https://vucerd.gob.do/media/9/az%C3%BAcar.pdf",
    );
    expect(normalizarUrlNovedad("/media/9/aviso.pdf")).toBeNull();
    expect(normalizarUrlNovedad("javascript:alert(1)")).toBeNull();
  });

  it("solo marca «no disponible» los enlaces que no responden o dan error", () => {
    expect(estadoEnlacePorCodigo(200)).toBe("ok");
    expect(estadoEnlacePorCodigo(301)).toBe("ok");
    expect(estadoEnlacePorCodigo(403)).toBe("restringido");
    expect(estadoEnlacePorCodigo(404)).toBe("no_disponible");
    expect(estadoEnlacePorCodigo(503)).toBe("no_disponible");
    expect(estadoEnlacePorCodigo(null)).toBe("no_disponible");
  });

  it("los avisos PDF se abren en el visor integrado", () => {
    expect(abreEnVisorPdf({ url: "https://vucerd.gob.do/media/1/aviso.pdf" })).toBe(true);
    expect(abreEnVisorPdf({ url: "https://dgii.gov.do/noticias/x", enlace_es_pdf: true })).toBe(true);
    expect(abreEnVisorPdf({ url: "https://x.gob.do/descarga.pdf", enlace_es_pdf: false })).toBe(false);
    expect(abreEnVisorPdf({ url: "https://aduanas.gob.do/noticias/x" })).toBe(false);
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

describe("huella del documento para duplicados", () => {
  const pdf = (cuerpo: string, fecha: string, id: string) =>
    new TextEncoder().encode(
      `%PDF-1.7\n1 0 obj\n<< /Title (Aviso) /ModDate (D:${fecha}Z) >>\nendobj\n2 0 obj\n(${cuerpo})\nendobj\n` +
        `xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /ID [<${id}> <${id}>] >>\nstartxref\n${fecha.length * 7}\n%%EOF`,
    );

  it("mismo nombre y mismo contenido, subido de nuevo con otra fecha e /ID: es la misma novedad", async () => {
    const a = pdf("Formulario de azucar", "20260727130905", "BB1E7CA9");
    const b = pdf("Formulario de azucar", "20260901175842", "DDA18EF3");
    const ha = { bytes: a.length, sha256: await sha256Contenido(a) };
    const hb = { bytes: b.length, sha256: await sha256Contenido(b) };
    expect(ha.sha256).toBe(hb.sha256);
    expect(esMismoDocumento(ha, hb)).toBe(true);
  });

  it("mismo nombre pero contenido distinto: son novedades diferentes", async () => {
    const a = pdf("Formulario de azucar", "20260727130905", "BB1E7CA9");
    const b = pdf("Formulario de arroz.", "20260727130905", "BB1E7CA9");
    const ha = { bytes: a.length, sha256: await sha256Contenido(a) };
    const hb = { bytes: b.length, sha256: await sha256Contenido(b) };
    expect(ha.bytes).toBe(hb.bytes);
    expect(esMismoDocumento(ha, hb)).toBe(false);
  });

  it("sin hash, un tamaño distinto basta para tratarlas como diferentes", () => {
    expect(esMismoDocumento({ bytes: 91642, sha256: null }, { bytes: 91700, sha256: null })).toBe(false);
    expect(esMismoDocumento({ bytes: 91642, sha256: null }, { bytes: 91642, sha256: null })).toBe(true);
  });

  it("si no se pudo leer alguno de los archivos, se mantiene como duplicado", () => {
    expect(mismoContenido(null, { bytes: 10, sha256: "x" })).toBeNull();
    expect(esMismoDocumento(null, { bytes: 10, sha256: "x" })).toBe(true);
  });
});
