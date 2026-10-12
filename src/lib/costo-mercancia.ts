/** Concepto manual de Costo de mercancía que la fila automática de Servicio Aduanero reemplaza. */
export const CONCEPTO_TASA_SERVICIO = "Tasa Servicio Aduanero";

/** Concepto manual retirado: el Formulario DUA ahora se suma siempre de forma automática. */
export const CONCEPTO_DUA_MANUAL = "Declaración Única Aduanera";

/** Cargo fijo del Formulario DUA (RD$), sumado automáticamente al costo de mercancía. */
export const FORMULARIO_DUA_RD = 258.26;

/** La fila manual queda reemplazada (no se suma) cuando hay una fila automática equivalente. */
export function filaReemplazadaPorServicio(concepto: string | null | undefined, servicioUsd: number): boolean {
  const c = String(concepto ?? "").trim();
  if (c === CONCEPTO_DUA_MANUAL) return true;
  return servicioUsd > 0 && c === CONCEPTO_TASA_SERVICIO;
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
