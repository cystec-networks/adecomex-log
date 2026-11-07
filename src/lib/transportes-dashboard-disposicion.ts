/** Disposición personal (por usuario) del Dashboard de Transportes. */

export const KPI_DASH_TRANSPORTES_IDS = ["viajes", "contenedores", "ingreso", "margen"] as const;
export type KpiDashTransportesId = (typeof KPI_DASH_TRANSPORTES_IDS)[number];
export const CLAVE_KPI_DASH_TRANSPORTES = "transportes-dashboard-kpi-orden";

/** Mismos ids que `EstadoDashboard`. */
export const ESTADOS_DASH_TRANSPORTES_IDS = ["programado", "en_transito", "retrasado", "entregado", "facturado"] as const;
export type EstadoDashTransportesId = (typeof ESTADOS_DASH_TRANSPORTES_IDS)[number];
export const CLAVE_ESTADOS_DASH_TRANSPORTES = "transportes-dashboard-estados-orden";

/** Bloques grandes de la página, incluido «Estados» (recuadros + gráfica) como una sola unidad. */
export const BLOQUES_DASH_TRANSPORTES_IDS = ["estados", "contenedores", "rentabilidad"] as const;
export type BloqueDashTransportesId = (typeof BLOQUES_DASH_TRANSPORTES_IDS)[number];
/** «Estados» se incorporó después y siempre estuvo arriba: en órdenes guardados sin él, va primero. */
export const BLOQUES_DASH_TRANSPORTES_AL_INICIO: readonly BloqueDashTransportesId[] = ["estados"];
export const CLAVE_BLOQUES_DASH_TRANSPORTES = "transportes-dashboard-bloques-orden";

/** Ordena elementos con `key` según el orden elegido (los desconocidos quedan al final). */
export function ordenarPorClave<T extends { key: string }>(items: readonly T[], orden: readonly string[]): T[] {
  const pos = new Map(orden.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (pos.get(a.key) ?? Infinity) - (pos.get(b.key) ?? Infinity));
}
