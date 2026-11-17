// Reglas compartidas de la Papelera de documentos y del «Cambiar tipo de documento».
// La base de datos (RPC documento_enviar_papelera / restaurar / purgar / cambiar_tipo) aplica los permisos
// y la Auditoría; aquí solo viven los plazos, el código SIGA del nuevo tipo y qué lector corresponde.
import { prefijoSiga, prefijosAceptados, type PrefijoSiga } from "./codigo-siga";
import { esTipoLecturaDua } from "./declaracion-dua";
import { TIPO_RECIBO_DGA } from "./recibo-dga";
import { TIPO_SEGUIMIENTO_SIGA } from "./seguimiento-siga";

export const DIAS_RESTAURACION = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha límite para restaurar: 30 días después de enviarlo a la Papelera. */
export function restaurableHasta(eliminadoEn: string): Date {
  return new Date(new Date(eliminadoEn).getTime() + DIAS_RESTAURACION * DIA_MS);
}

/** Se puede restaurar mientras no hayan pasado 30 días (después solo el Administrador lo borra). */
export function puedeRestaurar(eliminadoEn: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() <= restaurableHasta(eliminadoEn).getTime();
}

/** Días que quedan para restaurar, redondeados hacia arriba (30 recién eliminado; 1 el último día; ≤0 vencido). */
export function diasParaRestaurar(eliminadoEn: string, ahora: Date = new Date()): number {
  return Math.ceil((restaurableHasta(eliminadoEn).getTime() - ahora.getTime()) / DIA_MS);
}

/**
 * Código SIGA al cambiar de tipo: se conserva si su prefijo vale para el nuevo tipo; si no, hace falta el
 * siguiente correlativo del prefijo nuevo. Un documento sin código sigue sin código.
 */
export function codigoParaNuevoTipo(codigoActual: string | null | undefined, tipoNuevo: string):
  { conservar: true } | { conservar: false; prefijo: PrefijoSiga } {
  const actual = String(codigoActual ?? "").trim();
  if (!actual) return { conservar: true };
  const prefijo = actual.split("-")[0]?.toUpperCase() as PrefijoSiga;
  if (prefijosAceptados(tipoNuevo).includes(prefijo)) return { conservar: true };
  return { conservar: false, prefijo: prefijoSiga(tipoNuevo) };
}

export type LectorDocumento = "dua" | "recibo" | "siga";

/** Lector automático que corresponde a cada tipo (null: el tipo no tiene lectura automática). */
export function lectorDeTipo(tipo: string | null | undefined): LectorDocumento | null {
  if (esTipoLecturaDua(tipo)) return "dua";
  if (tipo === TIPO_RECIBO_DGA) return "recibo";
  if (tipo === TIPO_SEGUIMIENTO_SIGA) return "siga";
  return null;
}

/** Una casilla fija (Declaración/Liquidación) ocupada no recibe otro archivo: primero hay que retirar el actual. */
export function casillaOcupada(tipoNuevo: string, casillasUnicas: ReadonlySet<string>, tiposConDocumento: ReadonlySet<string>): boolean {
  return casillasUnicas.has(tipoNuevo) && tiposConDocumento.has(tipoNuevo);
}

/** Nombres visibles de los campos que puede completar una relectura. */
export const LABEL_CAMPO_RELECTURA: Record<string, string> = {
  numero_dua: "Declaración DUA",
  fecha_presentacion_real: "Fecha de Presentación",
  bl_awb: "BL/AWB",
  fecha_llegada_real: "Fecha de llegada",
  puerto_arribo: "Puerto de arribo",
  puerto_arribo_codigo: "Código de puerto",
  peso_neto: "Peso neto",
  liq_dga_manifiesto: "N° de Manifiesto",
  liq_dga_resultado_inspeccion: "N° Resultado de Inspección (ResuInsp)",
  liq_siga_numero: "N° de Liquidación",
  liq_siga_estado: "Estado de la Liquidación",
  liq_siga_pin_pago: "PIN de pago",
  liq_siga_registro_at: "Registro del PIN",
  liq_siga_fecha_registro: "Fecha de registro",
  liq_siga_termino_at: "Vencimiento del PIN",
  liq_siga_fecha_pago: "Fecha de pago",
  liq_oficial_total: "Total pagado",
  liq_recibo_numero: "N° de recibo",
  liq_recibo_banco: "Banco",
  liq_recibo_transaccion: "N° de transacción",
};
