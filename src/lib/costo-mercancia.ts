/** Concepto manual de Costo de mercancía que la fila automática de Servicio Aduanero reemplaza. */
export const CONCEPTO_TASA_SERVICIO = "Tasa Servicio Aduanero";

/** La fila manual queda reemplazada (no se suma) cuando la automática tiene monto. */
export function filaReemplazadaPorServicio(concepto: string | null | undefined, servicioUsd: number): boolean {
  return servicioUsd > 0 && String(concepto ?? "").trim() === CONCEPTO_TASA_SERVICIO;
}

/** Total en RD$ de Costo de mercancía que sí se suma, excluyendo filas reemplazadas por la automática. */
export function totalCostoMercanciaRd(
  filas: { concepto?: string | null; monto_real?: number | string | null }[] | null | undefined,
  servicioUsd: number,
): number {
  return (filas ?? []).reduce(
    (s, c) => (filaReemplazadaPorServicio(c.concepto, servicioUsd) ? s : s + (Number(c.monto_real) || 0)),
    0,
  );
}
