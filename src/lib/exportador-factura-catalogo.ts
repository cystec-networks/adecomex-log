import type { TerceroRegistro } from "./terceros-certificado";

type Proveedor = TerceroRegistro & { activo: boolean };

export function normalizarProveedor(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ")
    .replace(/(?:\s+(?:INCORPORATED|INC|LLC|LTD|LIMITED|CORPORATION|CORP|S R L|SRL|S A|SA))+$/, "");
}

function similitud(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + Number(a[i - 1] !== b[j - 1]));
    }
    anterior = actual;
  }
  return 1 - anterior[b.length] / Math.max(a.length, b.length);
}

/** Select only a clear identity; the exporter role disambiguates company-specific SIGA documents. */
export function resolverExportadorFactura<T extends Proveedor>(nombre: string, filas: T[]): T | null {
  const buscado = normalizarProveedor(nombre);
  if (!buscado) return null;
  const candidatos = filas.filter((f) => f.activo && f.tid.trim()).map((fila) => {
    const normalizado = normalizarProveedor(fila.nombre);
    return { fila, normalizado, score: normalizado === buscado ? 1 : Math.min(buscado.length, normalizado.length) >= 10 ? similitud(buscado, normalizado) : 0 };
  }).filter((c) => c.score >= 0.94).sort((a, b) => b.score - a.score);
  const mejor = candidatos[0];
  if (!mejor) return null;
  if (candidatos.some((c) => c.normalizado !== mejor.normalizado && mejor.score - c.score < 0.05)) return null;
  const mismaEmpresa = candidatos.filter((c) => c.normalizado === mejor.normalizado);
  const prioridad = (f: Proveedor) => f.rol_siga === "exportadora" ? 2 : !f.rol_siga || f.rol_siga === "sin_especificar" ? 1 : 0;
  const rango = Math.max(...mismaEmpresa.map((c) => prioridad(c.fila)));
  const finales = mismaEmpresa.filter((c) => prioridad(c.fila) === rango);
  return finales.length === 1 ? finales[0].fila : null;
}

/** The form stores the catalog identity as its canonical name/TID pair, not a separate supplier FK. */
export function camposProveedorCatalogo(t: TerceroRegistro) {
  return {
    suplidor: t.nombre,
    suplidor_rnc: t.tid,
    ...(t.pais_nombre ? { pais_origen: t.pais_nombre } : {}),
    ...(t.pais_codigo ? { pais_origen_codigo: t.pais_codigo } : {}),
  };
}