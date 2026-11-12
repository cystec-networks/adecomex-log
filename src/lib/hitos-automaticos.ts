/**
 * Fechas automáticas del Checklist de Despacho. La base de datos las pone (triggers y
 * `aplicar_hito_automatico`), nunca sobre una fecha manual, y las registra en Auditoría.
 * Aquí viven solo las reglas de presentación: etiqueta visible y texto del evento al pasar el mouse.
 */
import { fmtFechaHora } from "@/lib/documento-versiones";

export const ORIGENES_AUTOMATICOS = ["correo", "documentos", "vuce_pdf", "vuce_ficha", "vuce_carga", "correo_dga", "gestor", "ecf"] as const;
export type OrigenAutomatico = (typeof ORIGENES_AUTOMATICOS)[number];

export type HitoAuto = {
  auto_origen?: string | null;
  auto_fecha?: string | null;
  auto_detalle?: unknown;
};

const ZONA = "America/Santo_Domingo";

/** Solo el día (dd/mm/aaaa) en hora de Santo Domingo, para eventos que no traen hora. */
export function fmtFechaDia(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year}`;
}

const esOrigenAutomatico = (o: string | null | undefined): o is OrigenAutomatico =>
  !!o && (ORIGENES_AUTOMATICOS as readonly string[]).includes(o);

/** Muestra la etiqueta solo cuando la fecha la puso el sistema. */
export function esHitoAutomatico(h: HitoAuto): boolean {
  return esOrigenAutomatico(h.auto_origen) && !!h.auto_fecha;
}

/** Texto visible de la etiqueta: «Correo preparado» y «Emisión e-CF» dicen qué evento es; el resto, «Automático». */
export function etiquetaHitoAutomatico(h: HitoAuto): string {
  if (h.auto_origen === "correo_dga") return "Correo preparado";
  if (h.auto_origen === "ecf") return "Emisión e-CF";
  return "Automático";
}

function detalle(h: HitoAuto, clave: string): string {
  const d = h.auto_detalle;
  if (!d || typeof d !== "object") return "";
  const v = (d as Record<string, unknown>)[clave];
  return typeof v === "string" ? v.trim() : "";
}

/** Evento que originó la fecha, para mostrar al pasar el mouse. */
export function textoHitoAutomatico(h: HitoAuto): string {
  const f = h.auto_fecha;
  const permiso = detalle(h, "permiso");
  const delPermiso = permiso ? ` del permiso ${permiso}` : " del permiso";
  const usuario = detalle(h, "usuario");
  const por = usuario ? ` por ${usuario}` : "";
  switch (h.auto_origen) {
    case "correo": return `Correo recibido el ${fmtFechaHora(f)}`;
    case "documentos": return `Primera carga de documentos el ${fmtFechaHora(f)}`;
    case "vuce_pdf": return `Solicitud registrada en VUCE el ${fmtFechaDia(f)} (PDF${delPermiso})`;
    case "vuce_ficha": return `Fecha de Solicitud de la ficha${delPermiso}: ${fmtFechaDia(f)}`;
    case "vuce_carga": {
      const codigo = detalle(h, "codigo_siga");
      return `PDF del permiso VUCE${codigo ? ` (${codigo})` : ""} cargado el ${fmtFechaHora(f)}`;
    }
    case "correo_dga": return `Correo a DGA preparado el ${fmtFechaHora(f)}${por}`;
    case "gestor": {
      const gestor = detalle(h, "gestor");
      return `Enviado al gestor${gestor ? ` ${gestor}` : ""} el ${fmtFechaHora(f)}${usuario ? ` · registrado por ${usuario}` : ""}`;
    }
    case "ecf": {
      const encf = detalle(h, "encf");
      return `Emisión de la e-CF${encf ? ` ${encf}` : ""} el ${fmtFechaDia(f)}`;
    }
    default: return "";
  }
}

/** Aclaración adicional del evento cuando no confirma por sí mismo el hito. */
export function notaHitoAutomatico(h: HitoAuto): string | null {
  if (h.auto_origen === "correo_dga") return "Solo indica que se preparó el borrador en Gmail; no confirma que se haya enviado.";
  if (h.auto_origen === "ecf") return "Primera e-CF de venta vinculada al Expediente.";
  return null;
}

/** Al editar la fecha a mano, el hito deja de ser automático y nunca se vuelve a llenar solo. */
export const PARCHE_EDICION_MANUAL = {
  auto_origen: "manual",
  auto_fecha: null,
  auto_correo_id: null,
  auto_solicitud_id: null,
  auto_detalle: null,
  auto_ref_id: null,
} as const;
