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
/** Un artículo nuevo abre fragmento propio si el actual ya tiene este contenido (citas más precisas). */
export const MIN_CARACTERES_ANTES_DE_ARTICULO = 400;
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
    let abre = false; // el tramo actual empieza con un artículo
    for (const c of cortes) {
      const previo = texto.slice(desde, c.pos).trim();
      if (previo) unidades.push({ texto: previo, pagina: i + 1, articulo: actual, inicioArticulo: abre });
      actual = c.articulo;
      desde = c.pos;
      abre = true;
    }
    const resto = texto.slice(desde).trim();
    if (resto) unidades.push({ texto: resto, pagina: i + 1, articulo: actual, inicioArticulo: abre });
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
    if (largo() + u.texto.length > max || (u.inicioArticulo && largo() >= MIN_CARACTERES_ANTES_DE_ARTICULO)) vaciar();
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

// ===================== Detección de número y fecha de emisión =====================

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const RE_MES = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";

/** Palabras con las que el encabezado nombra a cada tipo de documento. */
const PALABRAS_TIPO: Record<TipoNormativa, string> = {
  Ley: "ley",
  Reglamento: "reglamento",
  Decreto: "decreto",
  Resolución: "resoluci[óo]n",
  "Norma general": "norma\\s+general",
  Circular: "circular",
  Guía: "gu[íi]a",
  Otro: "ley|reglamento|decreto|resoluci[óo]n|norma\\s+general|circular|aviso|acuerdo",
};
const TODOS_LOS_TIPOS = "ley|reglamento|decreto|resoluci[óo]n|norma\\s+general|circular|aviso|acuerdo";
/** «No.», «Núm.», «Número», «N.º», «N°», «#». */
const RE_NUM = "(?:n[úu]m(?:ero|\\.)?|no\\.?|n\\.?\\s?[°ºo]\\.?|#)\\s*:?";
/** Número: «168-21», «07-2018», «DGA-001-2024», «3489», «265/2023». */
const RE_VALOR_NUMERO = "((?:[A-Z]{1,8}-)?\\d{1,5}(?:\\s?[-/]\\s?(?:\\d{1,4}|[A-Z]{1,8}))*)";

/** Caracteres iniciales del texto que se consideran «encabezado». */
export const CARACTERES_ENCABEZADO = 1500;

function fechaValida(a: number, m: number, d: number, hoy: Date): string | null {
  if (a < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1 || f.getTime() > hoy.getTime() + 86_400_000) return null;
  return f.toISOString().slice(0, 10);
}

type FechaEncontrada = { iso: string; pos: number };

/** «año», también como lo deja el reconocimiento de texto de escaneos («a110», «afio»). */
const RE_ANO = "a(?:ñ|n|11|fi)[o0]";

/** «a los quince (15) días del mes de enero del año dos mil veintiséis (2026)». */
function fechasFormales(texto: string, hoy: Date): FechaEncontrada[] {
  const re = new RegExp(
    `\\(?\\s*(\\d{1,2})\\s*\\)?\\s*d[íi]as?\\s+del\\s+mes\\s+de\\s+${RE_MES}\\s+del?\\s+${RE_ANO}\\s+(?:[a-záéíóúñ\\s]{0,60}\\(\\s*(\\d{4})\\s*\\)|(\\d{4}))`,
    "gi",
  );
  const out: FechaEncontrada[] = [];
  for (const m of texto.matchAll(re)) {
    const iso = fechaValida(Number(m[3] ?? m[4]), MESES[m[2].toLowerCase()], Number(m[1]), hoy);
    if (iso) out.push({ iso, pos: m.index ?? 0 });
  }
  return out;
}

/** «15 de enero de 2026», «15 de enero del año 2026», «15/01/2026». */
function fechasSimples(texto: string, hoy: Date): FechaEncontrada[] {
  const out: FechaEncontrada[] = [];
  const re = new RegExp(`\\b(\\d{1,2})\\s+de\\s+${RE_MES}\\s+(?:de|del)\\s+(?:a[ñn]o\\s+)?(\\d{4})\\b`, "gi");
  for (const m of texto.matchAll(re)) {
    const iso = fechaValida(Number(m[3]), MESES[m[2].toLowerCase()], Number(m[1]), hoy);
    if (iso) out.push({ iso, pos: m.index ?? 0 });
  }
  for (const m of texto.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const iso = fechaValida(Number(m[3]), Number(m[2]), Number(m[1]), hoy);
    if (iso) out.push({ iso, pos: m.index ?? 0 });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

export type DatosDetectados = { numero: string | null; fecha_emision: string | null };

/**
 * Sugiere el número y la fecha de emisión de un documento a partir de su texto
 * (una cadena por página). Número: la primera mención «<tipo> núm. X» del
 * encabezado. Fecha: la última fecha formal del cierre («Dado en … a los X días
 * del mes de …», que en leyes y decretos es la promulgación); si no la hay, la
 * primera fecha del encabezado y, por último, la última del cierre. Es solo una
 * sugerencia: el administrador la confirma.
 */
export function detectarDatosDocumento(
  paginas: string[],
  tipo: string = "Otro",
  hoy: Date = new Date(),
): DatosDetectados {
  const limpias = paginas.map(limpiarTextoPagina).filter((p) => caracteresUtiles(p) >= MIN_CARACTERES_PAGINA);
  if (limpias.length === 0) return { numero: null, fecha_emision: null };
  const encabezado = limpias.slice(0, 2).join("\n").slice(0, CARACTERES_ENCABEZADO);
  const cierre = limpias.slice(-2).join("\n");

  const palabras = PALABRAS_TIPO[tipo as TipoNormativa] ?? TODOS_LOS_TIPOS;
  const buscarNumero = (patronTipo: string) => {
    // «Ley núm. 168-21» / «Decreto 265-23», o con palabras intermedias y «núm.»
    // obligatorio: «Ley General de Aduanas No. 168-21». Gana la mención más temprana.
    const directo = new RegExp(`(?:^|[^\\p{L}])(?:${patronTipo})\\s+(?:${RE_NUM}\\s*)?${RE_VALOR_NUMERO}`, "iu").exec(encabezado);
    const conNombre = new RegExp(
      `(?:^|[^\\p{L}])(?:${patronTipo})(?:\\s+[\\p{L},]+){1,8}?\\s+${RE_NUM}\\s*${RE_VALOR_NUMERO}`,
      "iu",
    ).exec(encabezado);
    const m = [directo, conNombre]
      .filter((x): x is RegExpExecArray => !!x)
      .sort((a, b) => a.index - b.index)[0];
    return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
  };
  // Decretos: «NÚMERO: 755-22» en una línea propia del encabezado.
  const lineaNumero = () => {
    const m = new RegExp(`(?:^|\\n)\\s*n[úu]mero\\s*:?\\s*${RE_VALOR_NUMERO}`, "iu").exec(encabezado);
    return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
  };
  // Un número suelto de 1–2 cifras sin año suele ser un artículo o apartado (o un
  // número partido por el reconocimiento de texto), no el número del documento.
  const util = (n: string | null) => (n && !/^\d{1,2}$/.test(n) ? n : null);
  // Primero con la palabra del tipo elegido, luego «NÚMERO:» y, si el tipo no es
  // «Otro»/«Guía», la primera mención de cualquier tipo.
  const numero =
    util(buscarNumero(palabras)) ??
    util(lineaNumero()) ??
    (tipo === "Otro" || tipo === "Guía" ? null : util(buscarNumero(TODOS_LOS_TIPOS)));

  const formales = fechasFormales(cierre, hoy);
  const fecha =
    formales.at(-1)?.iso ??
    fechasFormales(encabezado, hoy)[0]?.iso ??
    fechasSimples(encabezado, hoy)[0]?.iso ??
    fechasSimples(cierre, hoy).at(-1)?.iso ??
    null;
  return { numero, fecha_emision: fecha };
}

export type FichaNormativa = {
  titulo: string;
  tipo: string;
  numero: string | null;
  numero_detectado: boolean;
  fecha_emision: string | null;
  fecha_emision_detectada: boolean;
  estado_vigencia: string;
  procesamiento_estado: string;
  fragmentos_total: number;
  fragmentos_listos: number;
  fuente_url: string | null;
};

/** Estado de procesamiento en palabras, para que el asistente avise si aún no se puede consultar. */
export function textoProcesamiento(f: Pick<FichaNormativa, "procesamiento_estado" | "fragmentos_total" | "fragmentos_listos">): string {
  switch (f.procesamiento_estado) {
    case "listo":
      return "procesado: su texto está disponible para consulta";
    case "procesando":
      return f.fragmentos_total > 0
        ? `AÚN SE ESTÁ PROCESANDO (${f.fragmentos_listos} de ${f.fragmentos_total} fragmentos listos): su texto puede estar incompleto`
        : "AÚN SE ESTÁ PROCESANDO: su texto todavía no se puede consultar";
    case "pendiente":
      return "PENDIENTE DE PROCESAR: su texto todavía no se puede consultar";
    case "escaneado":
      return "PDF ESCANEADO SIN TEXTO: su contenido no se puede consultar";
    default:
      return "ERROR AL PROCESAR: su texto no está disponible (o está incompleto)";
  }
}

/** Fichas (datos registrados por el administrador) de los documentos de la base normativa. */
export function formatearFichasNormativaParaPrompt(fichas: FichaNormativa[] | null): string {
  if (fichas === null) return "(No se pudieron consultar las fichas de la base normativa en este momento.)";
  if (fichas.length === 0) return "(La base normativa no tiene documentos cargados.)";
  const una = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
  return fichas
    .map((f) => {
      const numero = f.numero
        ? `${una(f.numero, 60)}${f.numero_detectado ? " (detectado automáticamente, sin confirmar)" : ""}`
        : "no registrado";
      const fecha = f.fecha_emision
        ? `${fechaDmy(f.fecha_emision)}${f.fecha_emision_detectada ? " (detectada automáticamente, sin confirmar)" : ""}`
        : "no registrada";
      return `- ${una(f.titulo, 250)} | Tipo: ${f.tipo} | Número: ${numero} | Fecha de emisión: ${fecha} | Vigencia: ${etiquetaVigencia(f.estado_vigencia)} | Estado: ${textoProcesamiento(f)}${f.fuente_url ? ` | Fuente oficial: ${f.fuente_url}` : ""}`;
    })
    .join("\n");
}
