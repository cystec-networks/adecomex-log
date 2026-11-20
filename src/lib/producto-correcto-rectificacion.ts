/**
 * Autoguardado del campo «Producto correcto» (Rectificación técnica) en un Expediente ya creado.
 * Se limpian los espacios al inicio y al final y solo se guarda si el valor cambió.
 */
export function cambioProductoCorrecto(escrito: string | null | undefined, guardado: string | null | undefined): { cambia: boolean; valor: string } {
  const valor = String(escrito ?? "").trim();
  return { cambia: valor !== String(guardado ?? "").trim(), valor };
}

/** El autoguardado solo existe en un Expediente ya creado y para quien puede editarlo. */
export function autoguardaProductoCorrecto(isNuevo: boolean, puedeEditar: boolean): boolean {
  return !isNuevo && puedeEditar;
}
