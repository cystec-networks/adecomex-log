import { LABEL_CAMPO_SIGA } from "./seguimiento-siga";
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

const ETIQUETA_CAMPO_LIQUIDACION: Record<string, string> = {
  liq_dga_manifiesto: "N° de Manifiesto", liq_dga_resultado_inspeccion: "N° Resultado de Inspección", fecha_presentacion_real: "Fecha de Presentación",
  fecha_llegada_real: "Fecha de llegada", puerto_arribo: "Puerto", puerto_arribo_codigo: "Código de puerto", peso_neto: "Peso neto", bl_awb: "BL/AWB",
  liq_siga_numero: "N° de Liquidación", liq_siga_estado: "Estado de la Liquidación",
};

type FilaAuditoria = { accion: string; entidad: string; cambios?: unknown };

const ORIGEN_HITO: Record<string, string> = {
  correo: "correo recibido", documentos: "primera carga de documentos", vuce_pdf: "PDF del permiso VUCE",
  vuce_ficha: "ficha del permiso VUCE", vuce_carga: "carga del PDF del permiso VUCE", correo_dga: "correo a DGA preparado",
  gestor: "envío al gestor", ecf: "emisión e-CF", certificado_dga: "Certificado de Origen DGA",
};

/** Texto legible de la Bitácora; las acciones sin descripción propia se muestran tal cual. */
export function describirAuditoria(a: FilaAuditoria): string {
  const c = (a.cambios && typeof a.cambios === "object" ? a.cambios : {}) as Record<string, unknown>;
  const doc = [c.tipo, c.codigo_siga ? `(${c.codigo_siga})` : ""].filter(Boolean).join(" ");
  if (a.accion === "documento_reemplazado") {
    const origen = textoOrigen(typeof c.origen === "string" ? c.origen : null);
    return `Documento reemplazado: ${doc || "documento"}${origen ? ` · ${origen}` : ""}`;
  }
  const archivo = typeof c.archivo === "string" && c.archivo ? ` «${c.archivo}»` : "";
  const motivo = typeof c.motivo === "string" && c.motivo ? ` · Motivo: ${c.motivo}` : "";
  if (a.accion === "documento_enviado_papelera") return `Documento enviado a la Papelera: ${doc || "documento"}${archivo}${motivo}`;
  if (a.accion === "documento_restaurado") return `Documento restaurado desde la Papelera: ${doc || "documento"}${archivo}`;
  if (a.accion === "documento_borrado_definitivo") return `Documento borrado definitivamente de la Papelera: ${doc || "documento"}${archivo}`;
  if (a.accion === "documento_tipo_cambiado") {
    const antes = [c.tipo_anterior, c.codigo_anterior ? `(${c.codigo_anterior})` : ""].filter(Boolean).join(" ");
    return `Tipo de documento cambiado: ${antes || "—"} → ${doc || "—"}${archivo} · sin versión nueva${motivo}`;
  }
  if (a.accion === "documento_ruta_corregida") return `Nombre de archivo corregido: ${doc || "documento"} · sin versión nueva`;
  if (a.accion === "liquidacion_dga_completada") {
    const campos = Array.isArray(c.completados) ? c.completados.map((k) => ETIQUETA_CAMPO_LIQUIDACION[String(k)] ?? String(k)).join(", ") : "";
    const desde = c.tipo_documento === "Declaración Única Aduanera (DUA)" ? "el DUA" : "la Liquidación de Impuestos";
    const via = c.origen === "cambio_tipo" ? " · tras cambiar el tipo" : c.origen === "confirmado" ? " · aplicado tras confirmación" : "";
    return `Datos completados desde ${desde}${campos ? `: ${campos}` : ""}${via}`;
  }
  if (a.accion === "documento_reemplazo_revertido") return `Reemplazo revertido (guardado fallido): ${doc || "documento"}`;
  const hito = typeof c.nombre === "string" && c.nombre ? c.nombre : typeof c.hito === "string" ? c.hito : "hito";
  if (a.accion === "hito_automatico") {
    const f = typeof c.fecha === "string" ? c.fecha.split("-").reverse().join("/") : "";
    const retro = c.detalle && typeof c.detalle === "object" && (c.detalle as Record<string, unknown>).retroactivo === true;
    const det = (c.detalle && typeof c.detalle === "object" ? c.detalle : {}) as Record<string, unknown>;
    const extra = c.origen === "certificado_dga"
      ? `${typeof det.codigo_siga === "string" && det.codigo_siga ? ` (${det.codigo_siga})` : ""}${typeof det.usuario === "string" && det.usuario ? ` · ${det.usuario}` : ""}`
      : "";
    return `Fecha automática del hito «${hito}»${f ? `: ${f}` : ""}${ORIGEN_HITO[String(c.origen)] ? ` · ${ORIGEN_HITO[String(c.origen)]}` : ""}${extra}${retro ? " (completado retroactivamente)" : ""}`;
  }
  if (a.accion === "hito_documento_origen_eliminado") {
    const f = typeof c.fecha === "string" ? c.fecha.split("-").reverse().join("/") : "";
    const accion = c.motivo === "reclasificado" ? "cambió de tipo o de Expediente" : "se eliminó";
    return `${doc || "Documento"} ${accion}; la fecha del hito «${hito}»${f ? ` (${f})` : ""} se conserva`;
  }
  if (a.accion === "hito_automatico_retirado") return `Fecha automática retirada del hito «${hito}» (su origen ya no existe)`;
  if (a.accion === "enviado_gestor") return `Expediente enviado al gestor${typeof c.gestor === "string" && c.gestor ? ` ${c.gestor}` : ""}`;
  if (a.accion === "correo_dga_preparado") return "Correo a DGA preparado";
  if (a.accion === "seguimiento_siga_aplicado" || a.accion === "seguimiento_siga_rechazado") {
    const via = c.origen === "correo" ? " · correo automático" : "";
    if (a.accion === "seguimiento_siga_rechazado") {
      const errores = Array.isArray(c.errores) ? c.errores.filter((e) => typeof e === "string").join(" ") : "";
      return `Seguimiento SIGA no aplicado${via}${errores ? `: ${errores}` : ""}`;
    }
    const campos = Array.isArray(c.completados) ? c.completados.map((k) => LABEL_CAMPO_SIGA[String(k)] ?? String(k)) : [];
    const procesos = Number(c.procesos_nuevos ?? 0);
    const dif = Array.isArray(c.diferencias) ? c.diferencias.length : 0;
    return `Seguimiento SIGA aplicado${via}: ${campos.length ? `completó ${campos.join(", ")}` : "sin campos vacíos que completar"}${procesos ? ` · ${procesos} proceso(s) SIGA nuevo(s)` : ""}${dif ? ` · ${dif} diferencia(s) sin sobrescribir` : ""}`;
  }
  if (a.accion === "dua_automatico" || a.accion === "dua_no_aplicado") {
    const desde = c.tipo_documento === "Declaración Única Aduanera (DUA)" ? "el DUA" : "la Liquidación de Impuestos";
    const via = c.origen === "retroactivo" ? " (completado retroactivamente)" : c.origen === "leer_ahora" ? " · Leer ahora" : "";
    if (a.accion === "dua_no_aplicado") return `Declaración DUA no aplicada desde ${desde}${via}${typeof c.motivo === "string" && c.motivo ? `: ${c.motivo}` : ""}`;
    return `Declaración DUA automática: ${String(c.numero_dua ?? "")} desde ${desde}${c.fuente === "archivo" ? " (nombre del archivo)" : ""}${via}`;
  }
  if (a.accion === "factura_ecf_vinculada" || a.accion === "factura_ecf_desvinculada" || a.accion === "factura_ecf_monto_cambiado") {
    const rd = (v: unknown) => (v == null || v === "" ? "" : `RD$ ${Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const encf = typeof c.encf === "string" && c.encf ? c.encf : "e-CF";
    const quien = typeof c.usuario === "string" && c.usuario ? ` · ${c.usuario}` : "";
    if (a.accion === "factura_ecf_desvinculada") return `Factura ${encf} desvinculada${rd(c.monto_anterior) ? ` (tenía ${rd(c.monto_anterior)})` : ""}${quien}`;
    if (a.accion === "factura_ecf_monto_cambiado") return `Monto asignado de la factura ${encf}: ${rd(c.monto_anterior) || "factura completa"} → ${rd(c.monto) || "—"}${quien}`;
    return `Factura ${encf} vinculada${rd(c.monto) ? ` por ${rd(c.monto)}` : ""}${quien}`;
  }
  return a.accion;
}
