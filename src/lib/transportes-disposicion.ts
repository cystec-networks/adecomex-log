/** Recuadros KPI y columnas reordenables del listado de Transportes (orden por usuario). */

export const KPI_TRANSPORTES_IDS = ["flete", "pagado", "ganancia", "descuento-cxc"] as const;
export type KpiTransportesId = (typeof KPI_TRANSPORTES_IDS)[number];
export const CLAVE_KPI_TRANSPORTES = "transportes-kpi-orden";

export const COLUMNAS_TRANSPORTES_IDS = [
  "numero_viaje",
  "expediente",
  "cliente",
  "tipo",
  "transportista",
  "placa",
  "origen",
  "destino",
  "fecha_salida",
  "eta",
  "flete",
  "pagado",
  "ganancia",
  "descuento-cxc",
  "estado",
] as const;
export type ColumnaTransportesId = (typeof COLUMNAS_TRANSPORTES_IDS)[number];
export const CLAVE_COLUMNAS_TRANSPORTES = "transportes-columnas-orden";

/** Columnas con importe en la fila de totales. */
export const COLUMNAS_CON_TOTAL = new Set<ColumnaTransportesId>(["flete", "pagado", "ganancia", "descuento-cxc"]);

export type CeldaTotal = { tipo: "etiqueta"; colSpan: number } | { tipo: "vacia"; colSpan: number } | { tipo: "total"; id: ColumnaTransportesId };

/**
 * Celdas de la fila de totales para el orden actual de columnas: cada
 * columna con importe tiene su celda; las demás consecutivas se agrupan y el
 * primer grupo lleva la etiqueta «Total del período».
 */
export function celdasFilaTotales(orden: readonly ColumnaTransportesId[]): CeldaTotal[] {
  const celdas: CeldaTotal[] = [];
  let racha = 0;
  let etiquetada = false;
  const cerrar = () => {
    if (racha === 0) return;
    celdas.push({ tipo: etiquetada ? "vacia" : "etiqueta", colSpan: racha });
    etiquetada = true;
    racha = 0;
  };
  for (const id of orden) {
    if (COLUMNAS_CON_TOTAL.has(id)) { cerrar(); celdas.push({ tipo: "total", id }); }
    else racha += 1;
  }
  cerrar();
  return celdas;
}
