/**
 * Normaliza texto para búsquedas en el histórico de productos DGA:
 * minúsculas, sin acentos y sin espacios extra. Debe coincidir con la
 * columna generada `busqueda` de dga_productos_historico (lower + unaccent).
 */
export function normalizeBusqueda(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type DgaProducto = {
  codigo_producto: string;
  partida_arancelaria: string | null;
  nombre_producto: string | null;
  cod_marca: string | null;
  marca: string | null;
  cod_modelo: string | null;
  modelo: string | null;
  unidad: string | null;
  pais: string | null;
  especificaciones: string | null;
  regimen: string | null;
  estado: string | null;
  pct_gravamen?: number | null;
  aplica_isc?: boolean | null;
  pct_isc?: number | null;
  pct_itbis?: number | null;
};
