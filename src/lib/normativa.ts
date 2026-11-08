// Utilidades puras de la «Base normativa» del Asistente ADECOMEX: fragmentación
// del texto de un PDF con referencia a página y artículo, detección de PDF
// escaneado y bloque de datos para el asistente. Sin dependencias de servidor.

export const TIPOS_NORMATIVA = [
  "Ley",
  "Reglamento",
  "Decreto",
  "Resolución",
  "Norma general",
  "Circular",
  "Guía",
  "Otro",
] as const;
export type TipoNormativa = (typeof TIPOS_NORMATIVA)[number];

export const VIGENCIA_NORMATIVA = {
  vigente: "Vigente",
  derogado: "Derogado",
  no_verificado: "No verificado",
} as const;
export type EstadoVigencia = keyof typeof VIGENCIA_NORMATIVA;

/** Límites por documento para que el procesamiento termine en tiempo razonable. */
export const MAX_PAGINAS_NORMATIVA = 800;
export const MAX_FRAGMENTOS_NORMATIVA = 2500;
/** Tamaño objetivo de cada fragmento (caracteres) y solape al partir textos largos. */
export const MAX_CARACTERES_FRAGMENTO = 1800;
export const SOLAPE_FRAGMENTO = 200;
/** Fragmentos vectorizados por llamada (cada llamada es corta y se puede reanudar). */
export const LOTE_VECTORIZACION = 40;
/** Una página con menos caracteres útiles se considera sin texto (posible escaneo). */
export const MIN_CARACTERES_PAGINA = 40;

export type Fragmento = {
  orden: number;
  pagina_inicio: number;
  pagina_fin: number;
  articulo: string | null;
  contenido: string;
};

/** Normaliza el texto de una página: espacios simples, sin guiones de corte de línea. */
export function limpiarTextoPagina(texto: string): string {
  return texto
    .replace(/\r/g, "")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const caracteresUtiles = (t: string) => t.replace(/\s+/g, "").length;

/** Cuántas páginas no tienen texto legible (indicio de PDF escaneado). */
export function analizarTextoPaginas(paginas: string[]): {
  total: number;
  sinTexto: number;
  escaneado: boolean;
} {
  const sinTexto = paginas.filter((p) => caracteresUtiles(p) < MIN_CARACTERES_PAGINA).length;
  return { total: paginas.length, sinTexto, escaneado: paginas.length === 0 || sinTexto === paginas.length };
}

const ORDINALES =
  "[ÚU]NICO|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO";
/** Inicio de artículo: al principio de línea o tras un punto. */
const RE_ARTICULO = new RegExp(
  `(^|\\n|[.:;]\\s+)((?:ART[ÍI]CULO|Art[íi]culo|ART\\.|Art\\.)\\s*(\\d+(?:\\s*[.-]?\\s*(?:bis|ter|qu[áa]ter))?|${ORDINALES})\\b)`,
  "g",
);

/** «Artículo 12», «Artículo 5 bis», «Artículo único». */
export function normalizarArticulo(ref: string): string {
  const r = ref.replace(/\s+/g, " ").trim();
  const n = /^\d/.test(r)
    ? r.replace(/\s*[.-]\s*/g, " ").toLowerCase()
    : r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
  return `Artículo ${n}`;
}

type Unidad = { texto: string; pagina: number; articulo: string | null; inicioArticulo: boolean };

/** Divide cada página en tramos que empiezan en un artículo, arrastrando el artículo vigente. */
function unidadesPorArticulo(paginas: string[]): Unidad[] {
  const unidades: Unidad[] = [];
  let actual: string | null = null;
  paginas.forEach((bruto, i) => {
    const texto = limpiarTextoPagina(bruto);
    if (caracteresUtiles(texto) < MIN_CARACTERES_PAGINA) return;
    const cortes: Array<{ pos: number; articulo: string }> = [];
    for (const m of texto.matchAll(RE_ARTICULO)) {
      cortes.push({ pos: (m.index ?? 0) + m[1].length, articulo: normalizarArticulo(m[3]) });
    }
    let desde = 0;
    for (const c of cortes) {
      const previo = texto.slice(desde, c.pos).trim();
      if (previo) unidades.push({ texto: previo, pagina: i + 1, articulo: actual, inicioArticulo: desde > 0 });
      actual = c.articulo;
      desde = c.pos;
    }
    const resto = texto.slice(desde).trim();
    if (resto) unidades.push({ texto: resto, pagina: i + 1, articulo: actual, inicioArticulo: desde > 0 });
  });
  return unidades;
}

/** Parte un texto largo por frases/espacios, con solape, sin cortar palabras. */
function partirLargo(texto: string, max: number, solape: number): string[] {
  const partes: string[] = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = Math.min(texto.length, inicio + max);
    if (fin < texto.length) {
      const ventana = texto.slice(inicio, fin);
      const corte = Math.max(ventana.lastIndexOf(". "), ventana.lastIndexOf("\n"));
      const espacio = ventana.lastIndexOf(" ");
      const elegido = corte > max * 0.5 ? corte + 1 : espacio > max * 0.5 ? espacio : -1;
      if (elegido > 0) fin = inicio + elegido;
    }
    partes.push(texto.slice(inicio, fin).trim());
    if (fin >= texto.length) break;
    let siguiente = Math.max(inicio + 1, fin - solape);
    const esp = texto.indexOf(" ", siguiente);
    if (esp > 0 && esp < fin) siguiente = esp + 1;
    inicio = siguiente;
  }
  return partes.filter(Boolean);
}

function etiquetaArticulos(articulos: Array<string | null>): string | null {
  const distintos = [...new Set(articulos.filter((a): a is string => !!a))];
  if (distintos.length === 0) return null;
  if (distintos.length === 1) return distintos[0];
  const ultimo = distintos[distintos.length - 1].replace(/^Artículo /, "");
  return `${distintos[0].replace(/^Artículo /, "Artículos ")} a ${ultimo}`;
}

/**
 * Fragmenta el texto de un documento (una cadena por página) respetando, cuando
 * se puede, los límites de artículo. Cada fragmento conserva sus páginas y artículos.
 */
export function fragmentarDocumento(
  paginas: string[],
  max = MAX_CARACTERES_FRAGMENTO,
  solape = SOLAPE_FRAGMENTO,
): Fragmento[] {
  const salida: Fragmento[] = [];
  let buffer: Unidad[] = [];
  const largo = () => buffer.reduce((s, u) => s + u.texto.length + 1, 0);
  const vaciar = () => {
    if (!buffer.length) return;
    salida.push({
      orden: salida.length,
      pagina_inicio: buffer[0].pagina,
      pagina_fin: buffer[buffer.length - 1].pagina,
      articulo: etiquetaArticulos(buffer.map((u) => u.articulo)),
      contenido: buffer.map((u) => u.texto).join("\n").trim(),
    });
    buffer = [];
  };
  for (const u of unidadesPorArticulo(paginas)) {
    if (u.texto.length > max) {
      vaciar();
      for (const parte of partirLargo(u.texto, max, solape)) {
        salida.push({
          orden: salida.length,
          pagina_inicio: u.pagina,
          pagina_fin: u.pagina,
          articulo: u.articulo,
          contenido: parte,
        });
      }
      continue;
    }
    // Un artículo nuevo empieza fragmento si el actual ya tiene contenido suficiente.
    if (largo() + u.texto.length > max || (u.inicioArticulo && largo() > max * 0.6)) vaciar();
    buffer.push(u);
  }
  vaciar();
  return salida;
}

/** Texto que se vectoriza: el contenido con el título y el artículo como contexto. */
export function textoParaVectorizar(titulo: string, f: Pick<Fragmento, "articulo" | "contenido">): string {
  return `${titulo}${f.articulo ? ` — ${f.articulo}` : ""}\n${f.contenido}`;
}

export type FragmentoContexto = {
  titulo: string;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  estado_vigencia: string;
  fuente_url: string | null;
  pagina_inicio: number;
  pagina_fin: number;
  articulo: string | null;
  contenido: string;
  similitud: number;
};

/** Similitud mínima para considerar un fragmento relacionado con la pregunta. */
export const SIMILITUD_MINIMA_NORMATIVA = 0.45;

const fechaDmy = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export const textoPaginas = (inicio: number, fin: number) =>
  inicio === fin ? `página ${inicio}` : `páginas ${inicio}–${fin}`;

export function etiquetaVigencia(estado: string): string {
  return VIGENCIA_NORMATIVA[estado as EstadoVigencia] ?? "No verificado";
}

/** Bloque de datos para el asistente; el texto proviene de documentos cargados. */
export function formatearNormativaParaPrompt(fragmentos: FragmentoContexto[] | null): string {
  if (fragmentos === null) return "(No se pudo consultar la base normativa en este momento.)";
  const utiles = fragmentos.filter((f) => f.similitud >= SIMILITUD_MINIMA_NORMATIVA);
  if (utiles.length === 0) return "(No hay fragmentos de la base normativa relacionados con la pregunta.)";
  const sinSaltos = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
  return utiles
    .map((f, i) => {
      const doc = [f.tipo, f.numero ? `núm. ${f.numero}` : null].filter(Boolean).join(" ");
      const fecha = f.fecha_emision ? `emitido el ${fechaDmy(f.fecha_emision)}` : "fecha de emisión no indicada";
      return `[N${i + 1}] Documento: ${sinSaltos(f.titulo, 250)} (${doc}) | ${fecha} | Vigencia: ${etiquetaVigencia(f.estado_vigencia)}\nUbicación: ${f.articulo ? `${f.articulo}, ` : ""}${textoPaginas(f.pagina_inicio, f.pagina_fin)}${f.fuente_url ? `\nFuente oficial: ${f.fuente_url}` : ""}\nTexto: ${sinSaltos(f.contenido, 2000)}`;
    })
    .join("\n\n");
}

/** Nombre de archivo seguro para el almacenamiento. */
export function nombreArchivoSeguro(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}
