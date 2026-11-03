/** Agrupa honorarios de terceros (no reembolso) del mismo proveedor en una fila visual. */
export type FilaGasto<T> =
  | { tipo: "simple"; gasto: T }
  | { tipo: "grupo"; clave: string; proveedor: string; gastos: T[]; total: number };

type GastoBase = { concepto?: string | null; proveedor?: string | null; es_reembolso?: boolean | null; monto?: number | string | null };

export function agruparGastosHonorarios<T extends GastoBase>(gastos: T[]): FilaGasto<T>[] {
  const claveDe = (g: T) =>
    g.concepto === "Honorarios de terceros" && !g.es_reembolso && (g.proveedor ?? "").trim()
      ? (g.proveedor ?? "").trim().toUpperCase()
      : null;
  const conteo = new Map<string, T[]>();
  for (const g of gastos) {
    const k = claveDe(g);
    if (k) conteo.set(k, [...(conteo.get(k) ?? []), g]);
  }
  const filas: FilaGasto<T>[] = [];
  const emitidos = new Set<string>();
  for (const g of gastos) {
    const k = claveDe(g);
    const grupo = k ? conteo.get(k)! : null;
    if (!k || !grupo || grupo.length < 2) { filas.push({ tipo: "simple", gasto: g }); continue; }
    if (emitidos.has(k)) continue;
    emitidos.add(k);
    filas.push({
      tipo: "grupo", clave: k, proveedor: (grupo[0].proveedor ?? "").trim(), gastos: grupo,
      total: grupo.reduce((s, x) => s + Number(x.monto || 0), 0),
    });
  }
  return filas;
}
