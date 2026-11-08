// Lectura en voz alta del asistente con la síntesis de voz nativa del navegador
// (Web Speech API). Funciones puras: sin acceso a window para poder probarlas.

export const ASISTENTE_CLAVE_MODO_VOZ = "adecomex.asistente.modo-voz";
/** Chrome corta locuciones largas (~15 s): se lee por fragmentos cortos en cola. */
export const VOZ_MAX_FRAGMENTO = 220;

/** Preferencia de acento: dominicano, luego latinoamericano, luego España. */
const PREFERENCIA_IDIOMA = ["es-do", "es-us", "es-mx", "es-419", "es-co", "es-ve", "es-pr", "es-ar", "es-cl", "es-es"];

type VozBasica = { lang: string; default?: boolean; name?: string };

/** Elige la mejor voz en español disponible; null si el navegador no tiene ninguna. */
export function elegirVozEspanol<T extends VozBasica>(voces: readonly T[]): T | null {
  const espanol = voces.filter((v) => /^es([-_]|$)/i.test(v.lang ?? ""));
  if (espanol.length === 0) return null;
  const rango = (v: T) => {
    const i = PREFERENCIA_IDIOMA.indexOf(v.lang.toLowerCase().replace("_", "-"));
    return i === -1 ? PREFERENCIA_IDIOMA.length - 1 : i;
  };
  return [...espanol].sort((a, b) => rango(a) - rango(b) || Number(!!b.default) - Number(!!a.default))[0];
}

/** Convierte la respuesta en Markdown a texto natural para leer (sin símbolos ni enlaces). */
export function textoParaVoz(markdown: string): string {
  const lineas = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, "")
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*[-*+•]\s+/, "")
        .replace(/^\s*(\d+)[.)]\s+/, "$1. ")
        .replace(/\s*\|\s*/g, ", ")
        .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
        .replace(/[*#]+/g, " ")
        .replace(/^,\s*|,\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    // Cada línea es una pausa: si no termina en puntuación se añade un punto.
    .map((l) => (/[.!?;:…]$/.test(l) ? l : `${l}.`));
  return lineas.join(" ").trim();
}

/** Divide el texto en fragmentos de hasta `max` caracteres respetando frases y palabras. */
export function fragmentosParaVoz(texto: string, max = VOZ_MAX_FRAGMENTO): string[] {
  const frases = texto.split(/(?<=[.!?;:…])\s+/).map((f) => f.trim()).filter(Boolean);
  const piezas: string[] = [];
  for (const frase of frases) {
    if (frase.length <= max) {
      piezas.push(frase);
      continue;
    }
    let actual = "";
    for (const palabra of frase.split(/(?<=,)\s+|\s+/)) {
      if (actual && (actual + " " + palabra).length > max) {
        piezas.push(actual);
        actual = palabra;
      } else actual = actual ? `${actual} ${palabra}` : palabra;
    }
    if (actual) piezas.push(actual);
  }
  // Une frases cortas consecutivas para que la lectura fluya sin pausas extra.
  const fragmentos: string[] = [];
  for (const p of piezas) {
    const ultimo = fragmentos[fragmentos.length - 1];
    if (ultimo && (ultimo + " " + p).length <= max) fragmentos[fragmentos.length - 1] = `${ultimo} ${p}`;
    else fragmentos.push(p);
  }
  return fragmentos;
}
