/**
 * Autoguardado del campo «Producto correcto» (Rectificación técnica) en un Expediente ya creado.
 * Se limpian los espacios al inicio y al final y solo se guarda si el valor cambió.
 */
export function cambioProductoCorrecto(escrito: string | null | undefined, guardado: string | null | undefined): { cambia: boolean; valor: string } {
  const valor = String(escrito ?? "").trim();
  return { cambia: valor !== String(guardado ?? "").trim(), valor };
}

/** Roles a los que la base de datos permite actualizar un Expediente (política de UPDATE). */
export const ROLES_GUARDAN_PRODUCTO_CORRECTO = ["admin", "operaciones", "ejecutivo", "agente_aduanal"] as const;

/**
 * El autoguardado solo existe en un Expediente ya creado y para los roles que pueden guardarlo;
 * el resto (p. ej. Finanzas y Contabilidad) ve el campo en solo lectura.
 */
export function autoguardaProductoCorrecto(isNuevo: boolean, roles: readonly string[] | null | undefined): boolean {
  return !isNuevo && (roles ?? []).some((r) => (ROLES_GUARDAN_PRODUCTO_CORRECTO as readonly string[]).includes(r));
}
