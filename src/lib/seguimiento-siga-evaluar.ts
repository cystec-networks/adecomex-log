// Evaluación y aplicación compartidas por la subida manual (cliente, RLS) y el correo (servidor).
// Recibe el cliente de base de datos para no importar ninguno: el mismo criterio en ambos caminos.
import {
  HITOS_DESPACHO_SIGA, decidirSeguimientoSiga, diferenciasAlertaSiga, resolverAreaSiga, validarSeguimientoSiga,
  type DecisionSiga, type LecturaSigaGuardada, type ProcesoSiga, type SeguimientoSiga, type ValidacionSiga,
} from "./seguimiento-siga";

type Db = any;
/** Hito de levante o despacho completo: qué pasaría con la fecha de proceso del «Despacho completo». */
export type HitoDespachoSiga = { codigo: string; nombre: string; resultado: "se_completara" | "ya_tiene_fecha" | "manual" | "no_aplica" };
export type EvaluacionSiga = {
  actual: Record<string, unknown>; validacion: ValidacionSiga; decision: DecisionSiga;
  procesosNuevos: ProcesoSiga[]; procesosActualizados: ProcesoSiga[];
  /** Hitos de despacho que existen en el Checklist del Expediente (vacío si no hay ninguno). */
  hitosDespacho: HitoDespachoSiga[];
};

type ProcesoPrevio = { proceso: string; numero_solicitud: string | null; fecha_texto: string | null; fecha_creacion_texto: string | null; estado: string | null };

/** Mismo criterio que la base: mismo proceso y número de solicitud; sin número, misma fecha de proceso. */
export function clasificarProcesos(procesos: ProcesoSiga[], previos: ProcesoPrevio[]) {
  const nuevos: ProcesoSiga[] = []; const actualizados: ProcesoSiga[] = [];
  for (const p of procesos) {
    const num = p.numero_solicitud?.trim() || null;
    const candidatos = previos.filter((x) => x.proceso === p.proceso && (num ? x.numero_solicitud === num : !x.numero_solicitud && x.fecha_texto === p.fecha));
    if (!candidatos.length) { nuevos.push(p); continue; }
    const previo = candidatos.find((x) => (x.fecha_texto ?? "") === (p.fecha ?? "")) ?? candidatos[0];
    const cambia = (nuevo: string | null | undefined, viejo: string | null) => !!nuevo && nuevo !== viejo;
    if (cambia(p.estado, previo.estado) || cambia(p.fecha, previo.fecha_texto) || cambia(p.fecha_creacion, previo.fecha_creacion_texto)) actualizados.push(p);
  }
  return { nuevos, actualizados };
}

export async function evaluarSeguimientoSiga(db: Db, expedienteId: string, datos: SeguimientoSiga, visible?: Record<string, unknown> | null): Promise<EvaluacionSiga> {
  const [{ data: exp, error }, { data: endoso }, { data: previos }, areasRes, hitosRes] = await Promise.all([
    db.from("expedientes").select("*, clientes(nombre,rnc)").eq("id", expedienteId).single(),
    db.from("expediente_endosos").select("endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(nombre,rnc)").eq("expediente_id", expedienteId).eq("activo", true).maybeSingle(),
    db.from("expediente_siga_procesos").select("proceso,numero_solicitud,fecha_texto,fecha_creacion_texto,estado").eq("expediente_id", expedienteId),
    datos.administracion ? db.from("dga_areas").select("area,codigo") : Promise.resolve({ data: [] }),
    datos.despacho_fecha ? db.from("expediente_hitos").select("hito_codigo,estado,fecha_cumplimiento,auto_origen").eq("expediente_id", expedienteId).in("hito_codigo", Object.keys(HITOS_DESPACHO_SIGA)) : Promise.resolve({ data: [] }),
  ]);
  if (error || !exp) throw new Error(`No se pudo leer el Expediente: ${error?.message ?? "no encontrado"}`);
  const actual = { ...exp, ...(visible ?? {}) } as Record<string, unknown>;
  const validacion = validarSeguimientoSiga(actual, [exp.clientes, (endoso as any)?.endosado].filter(Boolean), datos);
  const decision = decidirSeguimientoSiga(actual, datos, resolverAreaSiga(datos.administracion, areasRes.data ?? []));
  const { nuevos, actualizados } = clasificarProcesos(datos.procesos, (previos ?? []) as ProcesoPrevio[]);
  const hitosDespacho: HitoDespachoSiga[] = ((hitosRes.data ?? []) as Array<{ hito_codigo: string; estado: string; fecha_cumplimiento: string | null; auto_origen: string | null }>).map((h) => ({
    codigo: h.hito_codigo, nombre: HITOS_DESPACHO_SIGA[h.hito_codigo] ?? h.hito_codigo,
    resultado: h.estado === "no_aplica" ? "no_aplica" : h.auto_origen === "manual" ? "manual" : h.fecha_cumplimiento || h.estado === "completado" ? "ya_tiene_fecha" : "se_completara",
  }));
  return { actual, validacion, decision, procesosNuevos: nuevos, procesosActualizados: actualizados, hitosDespacho };
}

export function lecturaParaGuardar(datos: SeguimientoSiga, metodo: "texto" | "ia", ev: EvaluacionSiga, archivo: string | null): LecturaSigaGuardada {
  return { datos, metodo, validacion: ev.validacion, diferencias: diferenciasAlertaSiga(ev.actual, datos), archivo };
}

export type ResultadoAplicarSiga = { completados: string[]; procesos_nuevos: number; procesos_actualizados: number; hitos: string[] };

/** Aplica (solo vacíos, en la base) o registra el rechazo; siempre deja Auditoría. */
export async function aplicarSeguimientoSiga(db: Db, p: { expedienteId: string; documentoId: string | null; datos: SeguimientoSiga; metodo: "texto" | "ia"; evaluacion: EvaluacionSiga; origen: "manual" | "correo"; archivo: string | null }): Promise<ResultadoAplicarSiga> {
  const ok = p.evaluacion.validacion.ok;
  // La fecha de despacho completo no es un campo del Expediente: la base la usa solo para los hitos de despacho.
  const campos = ok ? { ...p.evaluacion.decision.cambios, ...(p.datos.despacho_fecha ? { fecha_despacho_completo: p.datos.despacho_fecha, numero_despacho_referencia: p.datos.numero_despacho ?? "" } : {}) } : {};
  const { data, error } = await db.rpc("aplicar_seguimiento_siga", {
    p_expediente: p.expedienteId, p_documento: p.documentoId, p_estado: ok ? "aplicado" : "rechazado",
    p_campos: campos, p_procesos: ok ? p.datos.procesos : [],
    p_lectura: lecturaParaGuardar(p.datos, p.metodo, p.evaluacion, p.archivo), p_origen: p.origen,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Partial<ResultadoAplicarSiga>;
  return { completados: r.completados ?? [], procesos_nuevos: r.procesos_nuevos ?? 0, procesos_actualizados: r.procesos_actualizados ?? 0, hitos: r.hitos ?? [] };
}
