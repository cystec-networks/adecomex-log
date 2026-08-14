/**
 * Sanitiza texto de búsqueda antes de interpolarlo en filtros PostgREST (.or()).
 * Elimina los caracteres que PostgREST interpreta como sintaxis de filtro
 * (`,` `.` `(` `)` `"` `\` `:`) y los comodines de LIKE (`%` `_`),
 * evitando que el usuario altere la lógica de la consulta.
 */
export function sanitizeSearchTerm(input: string): string {
  return (input ?? "")
    .replace(/[,.()"'\\:%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Quita tildes y pasa a minúsculas para comparar nombres de catálogo. */
export function normalizarNombre(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Construye un patrón ILIKE insensible a tildes: sustituye las vocales y la `n`
 * por `_` (comodín de un carácter) para que "JAPON" también encuentre "JAPÓN".
 */
export function patronSinTildes(input: string): string {
  const term = sanitizeSearchTerm(input);
  if (!term) return "";
  return `%${term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[aeiouAEIOUnN]/g, "_")}%`;
}
