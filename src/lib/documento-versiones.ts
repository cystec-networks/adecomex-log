/**
 * Versiones de documentos del Expediente: el trigger `documentos_versionar_archivo`
 * guarda la versión anterior y sella `actualizado_en/por` en cada reemplazo de archivo.
 * Aquí solo viven reglas de presentación compartidas por Documentos, Historial y Auditoría.
 */

const ZONA = "America/Santo_Domingo";

/** «dd/mm/aaaa hh:mm» en hora de Santo Domingo (24 h). */
export function fmtFechaHora(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const ORIGENES: Record<string, string> = {
  manual: "",
  correo: "desde correo",
  generado: "regenerado",
};

export function textoOrigen(origen: string | null | undefined): string {
  return ORIGENES[origen ?? "manual"] ?? "";
}

/** Un documento muestra «Actualizado» e «Historial» solo si su archivo fue reemplazado. */
export function fueReemplazado(doc: { actualizado_en?: string | null } | null | undefined): boolean {
  return Boolean(doc?.actualizado_en);
}

export function etiquetaActualizado(doc: { actualizado_en?: string | null }): string {
  return `Actualizado ${fmtFechaHora(doc.actualizado_en)}`;
}

export function tooltipActualizado(doc: { actualizado_en?: string | null; actualizado_por?: string | null; actualizado_origen?: string | null }, nombres: Record<string, string>): string {
  const quien = doc.actualizado_por ? nombres[doc.actualizado_por] ?? "Usuario" : "Proceso automático";
  const origen = textoOrigen(doc.actualizado_origen);
  return `Reemplazado por ${quien}${origen ? ` (${origen})` : ""} el ${fmtFechaHora(doc.actualizado_en)}`;
}

type FilaAuditoria = { accion: string; entidad: string; cambios?: unknown };

const ORIGEN_HITO: Record<string, string> = {
  correo: "correo recibido", documentos: "primera carga de documentos", vuce_pdf: "PDF del permiso VUCE",
  vuce_ficha: "ficha del permiso VUCE", vuce_carga: "carga del PDF del permiso VUCE", correo_dga: "correo a DGA preparado",
  gestor: "envío al gestor", ecf: "emisión e-CF",
};

/** Texto legible de la Bitácora; las acciones sin descripción propia se muestran tal cual. */
export function describirAuditoria(a: FilaAuditoria): string {
  const c = (a.cambios && typeof a.cambios === "object" ? a.cambios : {}) as Record<string, unknown>;
  const doc = [c.tipo, c.codigo_siga ? `(${c.codigo_siga})` : ""].filter(Boolean).join(" ");
  if (a.accion === "documento_reemplazado") {
    const origen = textoOrigen(typeof c.origen === "string" ? c.origen : null);
    return `Documento reemplazado: ${doc || "documento"}${origen ? ` · ${origen}` : ""}`;
  }
  if (a.accion === "documento_reemplazo_revertido") return `Reemplazo revertido (guardado fallido): ${doc || "documento"}`;
  const hito = typeof c.nombre === "string" && c.nombre ? c.nombre : typeof c.hito === "string" ? c.hito : "hito";
  if (a.accion === "hito_automatico") {
    const f = typeof c.fecha === "string" ? c.fecha.split("-").reverse().join("/") : "";
    const retro = c.detalle && typeof c.detalle === "object" && (c.detalle as Record<string, unknown>).retroactivo === true;
    return `Fecha automática del hito «${hito}»${f ? `: ${f}` : ""}${ORIGEN_HITO[String(c.origen)] ? ` · ${ORIGEN_HITO[String(c.origen)]}` : ""}${retro ? " (completado retroactivamente)" : ""}`;
  }
  if (a.accion === "hito_automatico_retirado") return `Fecha automática retirada del hito «${hito}» (su origen ya no existe)`;
  if (a.accion === "enviado_gestor") return `Expediente enviado al gestor${typeof c.gestor === "string" && c.gestor ? ` ${c.gestor}` : ""}`;
  if (a.accion === "correo_dga_preparado") return "Correo a DGA preparado";
  return a.accion;
}
