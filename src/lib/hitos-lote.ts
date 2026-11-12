/** Presentación de la vista previa y los lotes retroactivos del Checklist de Despacho. */
import { ESTADO_LABEL } from "@/lib/estados-expediente";

export const HITOS_LOTE: Record<string, string> = {
  documentos_recibidos: "1 · Documentos digitales recibidos",
  permiso_vuce_solicitado: "2 · Permiso VUCE solicitado",
  solicitud_oficio_dga: "4 · Solicitud de oficio a DGA",
  factura_venta_enviada: "8 · Factura de venta enviada",
};
export const ORDEN_HITOS_LOTE = Object.keys(HITOS_LOTE);

export type CandidatoHito = {
  hito_id: string; expediente_id: string; numero: string; estado_expediente: string; hito_codigo: string;
  origen: string; evento_fecha: string; fecha: string; detalle: unknown; fecha_programada: string | null;
};

const ORIGEN: Record<string, string> = {
  correo: "Correo original", documentos: "Primera carga de documentos", vuce_pdf: "PDF del permiso VUCE",
  vuce_ficha: "Fecha de Solicitud de la ficha", vuce_carga: "Carga del PDF del permiso", correo_dga: "Correo a DGA preparado",
  ecf: "Emisión e-CF",
};

/** «De dónde sale» la fecha, con el dato concreto (tipo de documento, permiso, e-NCF o usuario). */
export function fuenteCandidato(c: Pick<CandidatoHito, "origen" | "detalle">): string {
  const d = (c.detalle && typeof c.detalle === "object" ? c.detalle : {}) as Record<string, unknown>;
  const extra = [d.tipo, d.permiso, d.codigo_siga, d.encf, d.usuario].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  return `${ORIGEN[c.origen] ?? c.origen}${extra ? ` · ${extra}` : ""}`;
}

export const estadoExpedienteLabel = (e: string) => (ESTADO_LABEL as Record<string, string>)[e] ?? e;

/** Conteos por hito y por estado del Expediente, en el orden de los hitos. */
export function desgloseCandidatos(cands: CandidatoHito[]) {
  const estados = [...new Set(cands.map((c) => c.estado_expediente))];
  const filas = ORDEN_HITOS_LOTE.map((h) => {
    const del = cands.filter((c) => c.hito_codigo === h);
    return { hito: h, total: del.length, porEstado: Object.fromEntries(estados.map((e) => [e, del.filter((c) => c.estado_expediente === e).length])) };
  });
  return { estados, filas, total: cands.length };
}

/** Unos 10 ejemplos reales por hito, los Expedientes más recientes primero. */
export function ejemplosCandidatos(cands: CandidatoHito[], porHito = 10) {
  return ORDEN_HITOS_LOTE.flatMap((h) =>
    cands.filter((c) => c.hito_codigo === h).sort((a, b) => b.numero.localeCompare(a.numero)).slice(0, porHito));
}
