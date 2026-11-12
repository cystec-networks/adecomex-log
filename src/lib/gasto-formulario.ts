/**
 * Reglas puras de la ventana de gasto operativo del Expediente
 * (Nuevo gasto / Editar gasto).
 */

export type ConceptoGastoCatalogo = { nombre: string; es_reembolso_defecto: boolean };

/**
 * Valor del interruptor «Es reembolso (resta del total)» al abrir «Nuevo gasto».
 * Arranca siempre desmarcado: no recuerda la última marca ni la toma de ningún
 * concepto. El valor por defecto del catálogo solo se aplica al elegir concepto.
 */
export const REEMBOLSO_INICIAL_NUEVO = false;

/**
 * Valor del interruptor «Es reembolso» al elegir un concepto.
 * Si el concepto está en el catálogo toma su «Es reembolso por defecto»;
 * si no (texto libre, «Otro»), conserva el valor actual.
 */
export function reembolsoPorConcepto(
  concepto: string,
  catalogo: ConceptoGastoCatalogo[],
  actual: boolean,
): boolean {
  const c = catalogo.find((x) => x.nombre === concepto);
  return c ? !!c.es_reembolso_defecto : actual;
}

/** El bloque «Datos fiscales del proveedor» se abre solo si ya hay RNC/Cédula o NCF. */
export function tieneDatosFiscales(f: { rnc_cedula_proveedor?: string | null; ncf_proveedor?: string | null }): boolean {
  return !!(f.rnc_cedula_proveedor ?? "").trim() || !!(f.ncf_proveedor ?? "").trim();
}
