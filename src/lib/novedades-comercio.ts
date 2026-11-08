// Utilidades puras de «Novedades de comercio exterior»: lectura de listados
// (RSS o HTML), claves de deduplicación y contexto para el asistente.
// Sin dependencias de navegador ni de servidor para poder probarlas.

export const CATEGORIAS_NOVEDAD = [
  "Aduanas",
  "Aranceles/Impuestos",
  "Permisos/VUCE",
  "Normativa",
  "Logística",
  "Mercado",
] as const;
export type CategoriaNovedad = (typeof CATEGORIAS_NOVEDAD)[number];

export const esCategoriaNovedad = (v: unknown): v is CategoriaNovedad =>
  typeof v === "string" && (CATEGORIAS_NOVEDAD as readonly string[]).includes(v);

/** Máximo de publicaciones nuevas que se analizan por fuente en cada revisión. */
export const MAX_NUEVAS_POR_FUENTE = 8;
/** Máximo de fuentes revisadas por ejecución. */
export const MAX_FUENTES_POR_REVISION = 12;

export type Candidata = {
  titulo: string;
  url: string;
  /** Fecha YYYY-MM-DD obtenida del propio listado, si la trae. */
  fecha: string | null;
  extracto: string;
};

/** Misma regla que la función SQL `novedad_url_clave`. */
export function claveUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
  uuml: "ü",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  iexcl: "¡",
  iquest: "¿",
};

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

const limpiar = (s: string) =>
  decodificarEntidades(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Convierte HTML en texto plano legible (sin scripts, estilos ni menús). */
export function textoPlanoHtml(html: string, max = 3000): string {
  const sinRuido = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const cuerpo = sinRuido.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? sinRuido;
  return limpiar(cuerpo.replace(/<\/(p|div|li|h\d|br|tr)>/gi, "\n")).slice(0, max);
}

const MESES: Record<string, number> = {
  jan: 1,
  ene: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  dic: 12,
};

const dos = (n: number) => String(n).padStart(2, "0");
function armarFecha(a: number, m: number, d: number): string | null {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${a}-${dos(m)}-${dos(d)}`;
}

/** Interpreta fechas ISO, RFC 822 (RSS) o dd/mm/aaaa (formato dominicano). */
export function fechaIso(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = texto.trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return armarFecha(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})\b/i);
  if (m && MESES[m[2].toLowerCase()]) return armarFecha(+m[3], MESES[m[2].toLowerCase()], +m[1]);
  m = t.match(/\b(\d{1,2})\s+de\s+([a-z]{3})[a-z]*\s+(?:de|del)\s+(\d{4})\b/i);
  if (m && MESES[m[2].toLowerCase()]) return armarFecha(+m[3], MESES[m[2].toLowerCase()], +m[1]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) return armarFecha(+m[3], +m[2], +m[1]);
  return null;
}

/** Fecha declarada en metadatos de un artículo (Open Graph / schema.org). */
export function fechaMetaHtml(html: string): string | null {
  const m =
    html.match(
      /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|datePublished|date|pubdate|DC\.date)["'][^>]*content=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished)["']/i,
    ) ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ??
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  return fechaIso(m?.[1]);
}

export function esFeed(contentType: string | null, cuerpo: string): boolean {
  if (contentType && /(rss|atom)\+xml/i.test(contentType)) return true;
  return /^\s*(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(cuerpo.slice(0, 600));
}

function resolver(href: string, base: string): string | null {
  try {
    const u = new URL(decodificarEntidades(href.trim()), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Lee las entradas de un canal RSS o Atom. */
export function parsearFeed(xml: string, base: string): Candidata[] {
  const bloques = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const vistos = new Set<string>();
  const salida: Candidata[] = [];
  for (const b of bloques) {
    const campo = (n: string) =>
      b.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i"))?.[1] ?? "";
    const titulo = limpiar(campo("title"));
    const enlace =
      limpiar(campo("link")) ||
      b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
      limpiar(campo("guid"));
    const url = enlace ? resolver(enlace, base) : null;
    if (!titulo || !url || vistos.has(claveUrl(url))) continue;
    vistos.add(claveUrl(url));
    salida.push({
      titulo: titulo.slice(0, 300),
      url,
      fecha: fechaIso(
        limpiar(campo("pubDate")) ||
          limpiar(campo("published")) ||
          limpiar(campo("updated")) ||
          limpiar(campo("dc:date")),
      ),
      extracto: limpiar(campo("description") || campo("summary") || campo("content:encoded")).slice(
        0,
        1200,
      ),
    });
  }
  return salida;
}

const NAVEGACION =
  /^(inicio|contacto|transparencia|servicios|sobre nosotros|ver m[aá]s|leer m[aá]s|m[aá]s noticias|siguiente|anterior|pol[ií]tica|t[eé]rminos|mapa del sitio)/i;

/**
 * Extrae enlaces de publicaciones de una página de listado. Prefiere los
 * enlaces bajo la misma ruta del listado (p. ej. /noticias/...) cuando hay
 * suficientes; si no, usa los enlaces largos del mismo sitio (incluye PDF).
 */
export function extraerEnlacesListado(html: string, urlListado: string): Candidata[] {
  let base: URL;
  try {
    base = new URL(urlListado);
  } catch {
    return [];
  }
  const anfitrion = base.hostname.replace(/^www\./, "");
  const rutaListado = base.pathname
    .replace(/\/(Paginas\/)?(default\.aspx|index\.\w+)?$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const limpio = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ");
  const todos: Array<Candidata & { bajoRuta: boolean }> = [];
  const vistos = new Set<string>();
  const propia = claveUrl(base.toString());
  for (const m of limpio.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolver(m[1], base.toString());
    if (!url) continue;
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") !== anfitrion) continue;
    const clave = claveUrl(url);
    if (clave === propia || vistos.has(clave)) continue;
    let texto = limpiar(m[2]).replace(/^icon\s+/i, "");
    if (!texto) texto = limpiar(m[0].match(/title=["']([^"']+)["']/i)?.[1] ?? "");
    if (texto.length < 25 || NAVEGACION.test(texto)) continue;
    vistos.add(clave);
    const ruta = decodeURIComponent(u.pathname).toLowerCase();
    const fecha = fechaIso(texto);
    todos.push({
      titulo: texto.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, "").slice(0, 300),
      url,
      fecha,
      extracto: "",
      bajoRuta:
        rutaListado.length > 1 &&
        ruta.startsWith(`${rutaListado}/`) &&
        ruta.length > rutaListado.length + 2,
    });
  }
  const bajoRuta = todos.filter((c) => c.bajoRuta);
  const elegidos = bajoRuta.length >= 3 ? bajoRuta : todos;
  return elegidos.map(({ bajoRuta: _b, ...c }) => c);
}

export const esPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

const VACIAS = new Set([
  "que",
  "qué",
  "hay",
  "sobre",
  "para",
  "como",
  "cómo",
  "cual",
  "cuál",
  "cuales",
  "cuáles",
  "esta",
  "este",
  "estos",
  "estas",
  "novedad",
  "novedades",
  "noticia",
  "noticias",
  "reciente",
  "recientes",
  "ultima",
  "última",
  "ultimas",
  "últimas",
  "nuevo",
  "nueva",
  "nuevos",
  "nuevas",
  "algo",
  "alguna",
  "algún",
  "tiene",
  "tienen",
  "desde",
  "entre",
  "semana",
  "dime",
  "puedes",
  "favor",
  "hola",
  "donde",
  "dónde",
  "cuando",
  "cuándo",
  "sabes",
  "saber",
  "informar",
  "información",
  "comercio",
  "exterior",
  "república",
  "dominicana",
]);

/** Palabras útiles de la pregunta para buscar novedades relacionadas. */
export function palabrasClave(texto: string, max = 6): string[] {
  const palabras = texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !VACIAS.has(p));
  return [...new Set(palabras)].slice(0, max);
}

export type NovedadContexto = {
  titulo: string;
  resumen: string;
  fecha_publicacion: string | null;
  fecha_captura: string;
  fuente_nombre: string;
  url: string;
  categoria: string;
};

const fechaDmy = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Día DD/MM/AAAA de un instante, en hora de Santo Domingo. */
export function diaSantoDomingo(instante: string): string {
  const f = new Date(instante);
  if (Number.isNaN(f.getTime())) return fechaDmy(instante);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(f);
  return fechaDmy(p);
}

/**
 * Texto de fecha de una novedad. Sin fecha de publicación lo dice expresamente
 * y muestra el día de registro, para no confundir una fecha con la otra.
 */
export function textoFechaNovedad(
  fechaPublicacion: string | null,
  fechaCaptura: string,
): string {
  return fechaPublicacion
    ? `publicada el ${fechaDmy(fechaPublicacion)}`
    : `fecha de publicación no disponible; registrada en la plataforma el ${diaSantoDomingo(fechaCaptura)}`;
}

export type EstadoIntento = "ok" | "sin_novedades" | "error" | "no_legible";
/** La fuente se pudo leer (con o sin publicaciones nuevas). */
export const intentoExitoso = (estado: string) => estado === "ok" || estado === "sin_novedades";

export type PatronIntentos = "sin_datos" | "estable" | "intermitente" | "siempre_falla";
/** Clasifica el historial de intentos de una fuente. */
export function patronIntentos(intentos: Array<{ exito: boolean }>): {
  patron: PatronIntentos;
  total: number;
  fallos: number;
} {
  const total = intentos.length;
  const fallos = intentos.filter((i) => !i.exito).length;
  const patron: PatronIntentos =
    total === 0
      ? "sin_datos"
      : fallos === 0
        ? "estable"
        : fallos === total
          ? "siempre_falla"
          : "intermitente";
  return { patron, total, fallos };
}

/** Bloque de datos que recibe el asistente; el texto proviene de sitios externos. */
export function formatearNovedadesParaPrompt(novedades: NovedadContexto[]): string {
  if (novedades.length === 0) return "(No hay novedades registradas.)";
  return novedades
    .map((n, i) => {
      const fecha = textoFechaNovedad(n.fecha_publicacion, n.fecha_captura);
      const sinSaltos = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
      return `[${i + 1}] ${sinSaltos(n.titulo, 250)}\nCategoría: ${n.categoria} | Fuente: ${sinSaltos(n.fuente_nombre, 120)} | ${fecha}\nEnlace: ${n.url}\nResumen: ${sinSaltos(n.resumen, 600)}`;
    })
    .join("\n\n");
}
