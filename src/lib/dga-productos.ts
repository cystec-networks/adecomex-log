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

// Encabezados reales del reporte de la DGA. El matching es tolerante:
// se ignoran tildes, mayúsculas, puntuación, espacios extra y las palabras "de"/"del".
export const COLUMN_ALIASES: Record<string, string[]> = {
  codigo_producto: ["Código de Producto", "Código Producto", "Codigo", "Product Code", "Cod Producto"],
  partida_arancelaria: ["Partida Arancelaria", "Partida", "HS Code", "Código Arancelario"],
  nombre_producto: ["Nombre de Producto", "Nombre Producto", "Producto", "Nombre", "Descripción"],
  cod_marca: ["Cod. Marca", "Código Marca", "Brand Code"],
  marca: ["Marca", "Brand"],
  cod_modelo: ["Cod. Modelo", "Código Modelo", "Model Code"],
  modelo: ["Modelo", "Model"],
  unidad: ["Unidad", "Unidad de Medida", "UM"],
  pais: ["País", "País Origen", "País de Origen", "Country"],
  especificaciones: ["Especificaciones", "Especificación", "Specification"],
  regimen: ["Régimen", "Régimen Aduanero"],
  estado: ["Estado", "Status"],
};

/** Clave tolerante: sin tildes, sin mayúsculas, sin puntuación, sin "de/del", sin espacios. */
export function headerKey(h: string) {
  return normalizeBusqueda(String(h ?? ""))
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "de" && w !== "del")
    .join("");
}

const ALIAS_KEYS: Record<string, string[]> = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([f, a]) => [f, a.map(headerKey)]),
);

export function mapRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) normalized[headerKey(k)] = v;
  const out: Record<string, string | null> = {};
  for (const [field, keys] of Object.entries(ALIAS_KEYS)) {
    let val: any = undefined;
    for (const a of keys) {
      if (normalized[a] != null && String(normalized[a]).trim() !== "") { val = normalized[a]; break; }
    }
    out[field] = val === undefined ? null : String(val).trim();
  }
  return out;
}

/** Lee un .xlsx de la DGA y devuelve las filas mapeadas y deduplicadas por código. */
export async function parseDgaXlsx(file: File) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  const mapped = json.map(mapRow).filter((r) => r.codigo_producto);
  const byCode = new Map<string, any>();
  mapped.forEach((r) => byCode.set(r.codigo_producto as string, r));
  return Array.from(byCode.values()) as Array<Record<string, string | null>>;
}
