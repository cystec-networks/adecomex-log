/**
 * Contexto del Asistente: solo las novedades y fragmentos de la Base normativa relacionados con la
 * pregunta (máximo 5 en total), en lugar de enviar toda la lista en cada consulta.
 */
import { palabrasClave, type NovedadContexto } from "./novedades-comercio";
import type { FichaNormativa, FragmentoContexto } from "./normativa";

export const MAX_RESULTADOS_ASISTENTE = 5;
/**
 * Similitud mínima medida con preguntas reales (12/11/2026): lo relacionado queda en 0,64–0,84 y lo
 * ajeno («¿cómo hago una tortilla?», novedades fuera de tema) en 0,44–0,58.
 */
export const SIMILITUD_MINIMA_NOVEDAD = 0.6;
export const SIMILITUD_MINIMA_FRAGMENTO = 0.55;
export const MAX_FICHAS_ASISTENTE = 5;

export type NovedadBuscada = NovedadContexto & { similitud: number };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** «¿Cuáles son las últimas novedades?», «¿qué hay de nuevo en VUCE?», «avisos de esta semana». */
export function pideRecientes(pregunta: string): boolean {
  const t = sinAcentos(pregunta);
  return /\b(ultim[oa]s?|recientes?|novedad(es)?|que hay de nuevo|esta semana|este mes|de hoy|hoy|publicad[oa]s?)\b/.test(t);
}

/** Instituciones que el usuario puede nombrar para filtrar novedades recientes. */
const INSTITUCIONES: Array<[RegExp, string[]]> = [
  [/\b(dga|aduanas?)\b/, ["dga", "aduana"]],
  [/\bvuce\b/, ["vuce"]],
  [/\bdgii\b/, ["dgii", "impuestos internos"]],
  [/\bhacienda\b/, ["hacienda"]],
  [/\bgaceta\b/, ["gaceta", "consultoria juridica"]],
  [/\b(micm|industria y comercio)\b/, ["micm", "industria"]],
];

export function institucionesDe(pregunta: string): string[] {
  const t = sinAcentos(pregunta);
  return INSTITUCIONES.filter(([re]) => re.test(t)).flatMap(([, claves]) => claves);
}

const fechaNovedad = (n: NovedadContexto) => n.fecha_publicacion ?? n.fecha_captura.slice(0, 10);
const porFechaDesc = (a: NovedadContexto, b: NovedadContexto) => fechaNovedad(b).localeCompare(fechaNovedad(a)) || b.fecha_captura.localeCompare(a.fecha_captura);

export type ContextoAsistente = { novedades: NovedadContexto[]; fragmentos: FragmentoContexto[] };

/**
 * Elige como máximo 5 resultados. Pregunta por lo más reciente sin tema concreto → las novedades más
 * recientes (de la institución nombrada, si la hay). Con tema → lo más parecido a la pregunta entre
 * novedades y fragmentos normativos, por encima de la similitud mínima.
 */
export function seleccionarContexto(p: {
  pregunta: string;
  novedades: NovedadBuscada[];
  fragmentos: FragmentoContexto[] | null;
  recientes?: NovedadContexto[];
  limite?: number;
}): ContextoAsistente {
  const limite = p.limite ?? MAX_RESULTADOS_ASISTENTE;
  const instituciones = institucionesDe(p.pregunta);
  const deInstitucion = (n: NovedadContexto) =>
    !instituciones.length || instituciones.some((c) => sinAcentos(`${n.fuente_nombre} ${n.titulo}`).includes(c));
  const novedades = p.novedades.filter((n) => n.similitud >= SIMILITUD_MINIMA_NOVEDAD);
  const fragmentos = (p.fragmentos ?? []).filter((f) => f.similitud >= SIMILITUD_MINIMA_FRAGMENTO);

  if (pideRecientes(p.pregunta)) {
    const tema = palabrasClave(p.pregunta).filter((w) => !institucionesDe(w).length && !pideRecientes(w));
    if (!tema.length) return { novedades: (p.recientes ?? []).filter(deInstitucion).sort(porFechaDesc).slice(0, limite), fragmentos: [] };
    const relacionadas = novedades.filter(deInstitucion).sort(porFechaDesc).slice(0, limite);
    if (relacionadas.length) return { novedades: relacionadas, fragmentos: fragmentos.slice(0, limite - relacionadas.length) };
  }

  const todos = [
    ...novedades.map((n) => ({ s: n.similitud, n, f: null as FragmentoContexto | null })),
    ...fragmentos.map((f) => ({ s: f.similitud, n: null as NovedadBuscada | null, f })),
  ].sort((a, b) => b.s - a.s).slice(0, limite);
  return {
    novedades: todos.flatMap((x) => (x.n ? [x.n] : [])),
    fragmentos: todos.flatMap((x) => (x.f ? [x.f] : [])),
  };
}

/**
 * Fichas que acompañan la respuesta: las de los documentos citados en los fragmentos y las que la
 * pregunta nombra (título o número). Nunca la lista completa.
 */
export function fichasRelacionadas<F extends FichaNormativa & { id?: string }>(
  fichas: F[] | null,
  pregunta: string,
  documentosCitados: Array<string | null | undefined>,
  max = MAX_FICHAS_ASISTENTE,
): F[] | null {
  if (fichas === null) return null;
  const citados = new Set(documentosCitados.filter(Boolean) as string[]);
  const claves = palabrasClave(pregunta, 8).map(sinAcentos);
  const nombra = (f: F) => {
    const texto = sinAcentos(`${f.titulo} ${f.numero ?? ""}`);
    return claves.some((c) => texto.includes(c));
  };
  const elegidas = [...fichas.filter((f) => f.id && citados.has(f.id)), ...fichas.filter((f) => !(f.id && citados.has(f.id)) && nombra(f))];
  return elegidas.slice(0, max);
}

/** Texto que se vectoriza de una novedad (mismo modelo que la Base normativa). */
export const textoVectorNovedad = (n: { titulo: string; resumen: string; categoria?: string | null; fuente_nombre?: string | null }) =>
  `${n.titulo}\n${[n.categoria, n.fuente_nombre].filter(Boolean).join(" | ")}\n${n.resumen}`.slice(0, 4000);
