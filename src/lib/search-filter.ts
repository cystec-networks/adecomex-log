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
