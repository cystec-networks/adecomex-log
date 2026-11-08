// Enlaces internos al visor de la «Base normativa». El asistente los escribe en
// sus citas y la plataforma los abre en el visor integrado en la página citada.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA_CITA = new RegExp(`^/normativa/(${UUID})/?$`, "i");

/** Bytes a partir de los cuales el visor carga el PDF por partes (rangos). */
export const UMBRAL_CARGA_POR_PARTES = 4 * 1024 * 1024;
/** Tamaño de cada parte pedida al almacenamiento. */
export const TAMANO_PARTE_PDF = 256 * 1024;

export type CitaNormativa = { documentoId: string; pagina: number | null };

/** Normaliza un número de página: entero ≥ 1 o `null`. */
export function paginaValida(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number.parseInt(String(valor ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
}

/** Ruta interna que abre el documento en el visor (opcionalmente en una página). */
export function enlaceCitaNormativa(documentoId: string, pagina?: number | null): string {
  const p = paginaValida(pagina);
  return `/normativa/${documentoId}${p ? `?pagina=${p}` : ""}`;
}

/**
 * Reconoce un enlace de cita (relativo o absoluto del propio sitio). Devuelve
 * `null` para cualquier otro enlace, que se abre como siempre.
 */
export function parsearEnlaceCita(href: string | null | undefined, origen?: string): CitaNormativa | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, origen ?? "http://interno.local");
  } catch {
    return null;
  }
  if (origen && href.includes("://") && url.origin !== new URL(origen).origin) return null;
  if (!origen && href.includes("://")) return null;
  const m = url.pathname.match(RUTA_CITA);
  if (!m) return null;
  return { documentoId: m[1].toLowerCase(), pagina: paginaValida(url.searchParams.get("pagina")) };
}
