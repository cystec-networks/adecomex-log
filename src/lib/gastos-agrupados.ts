/** Agrupación visual exclusiva de la pantalla consolidada de Honorarios de Terceros. */
export type FilaGasto<T> =
  | { tipo: "simple"; gasto: T }
  | { tipo: "grupo"; clave: string; proveedor: string; gastos: T[]; total: number };

type GastoBase = { expedienteId: string; proveedor: string; estado: "pendiente" | "pagado"; monto: number };

export function agruparHonorariosPendientes<T extends GastoBase>(gastos: T[]): FilaGasto<T>[] {
  const claveDe = (g: T) =>
    g.estado === "pendiente" && g.proveedor.trim()
      ? JSON.stringify([g.expedienteId, g.proveedor.trim().replace(/\s+/g, " ").toUpperCase()])
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
    const grupo = k ? conteo.get(k) : null;
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
