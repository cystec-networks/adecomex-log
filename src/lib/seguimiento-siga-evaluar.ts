// Evaluación y aplicación compartidas por la subida manual (cliente, RLS) y el correo (servidor).
// Recibe el cliente de base de datos para no importar ninguno: el mismo criterio en ambos caminos.
import { decidirSeguimientoSiga, diferenciasAlertaSiga, resolverAreaSiga, validarSeguimientoSiga, type DecisionSiga, type LecturaSigaGuardada, type ProcesoSiga, type SeguimientoSiga, type ValidacionSiga } from "./seguimiento-siga";

type Db = any;
export type EvaluacionSiga = { actual: Record<string, unknown>; validacion: ValidacionSiga; decision: DecisionSiga; procesosNuevos: ProcesoSiga[] };

export async function evaluarSeguimientoSiga(db: Db, expedienteId: string, datos: SeguimientoSiga, visible?: Record<string, unknown> | null): Promise<EvaluacionSiga> {
  const [{ data: exp, error }, { data: endoso }, { data: previos }, areasRes] = await Promise.all([
    db.from("expedientes").select("*, clientes(nombre,rnc)").eq("id", expedienteId).single(),
    db.from("expediente_endosos").select("endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(nombre,rnc)").eq("expediente_id", expedienteId).eq("activo", true).maybeSingle(),
    db.from("expediente_siga_procesos").select("proceso,numero_solicitud,fecha_texto").eq("expediente_id", expedienteId),
    datos.administracion ? db.from("dga_areas").select("area,codigo") : Promise.resolve({ data: [] }),
  ]);
  if (error || !exp) throw new Error(`No se pudo leer el Expediente: ${error?.message ?? "no encontrado"}`);
  const actual = { ...exp, ...(visible ?? {}) } as Record<string, unknown>;
  const validacion = validarSeguimientoSiga(actual, [exp.clientes, (endoso as any)?.endosado].filter(Boolean), datos);
  const decision = decidirSeguimientoSiga(actual, datos, resolverAreaSiga(datos.administracion, areasRes.data ?? []));
  const clave = (p: { proceso: string; numero_solicitud: string | null; fecha?: string | null; fecha_texto?: string | null }) => `${p.proceso}|${p.numero_solicitud ?? ""}|${p.fecha ?? p.fecha_texto ?? ""}`;
  const existentes = new Set((previos ?? []).map(clave));
  return { actual, validacion, decision, procesosNuevos: datos.procesos.filter((p) => !existentes.has(clave(p))) };
}

export function lecturaParaGuardar(datos: SeguimientoSiga, metodo: "texto" | "ia", ev: EvaluacionSiga, archivo: string | null): LecturaSigaGuardada {
  return { datos, metodo, validacion: ev.validacion, diferencias: diferenciasAlertaSiga(ev.actual, datos), archivo };
}

/** Aplica (solo vacíos, en la base) o registra el rechazo; siempre deja Auditoría. */
export async function aplicarSeguimientoSiga(db: Db, p: { expedienteId: string; documentoId: string | null; datos: SeguimientoSiga; metodo: "texto" | "ia"; evaluacion: EvaluacionSiga; origen: "manual" | "correo"; archivo: string | null }) {
  const ok = p.evaluacion.validacion.ok;
  const { data, error } = await db.rpc("aplicar_seguimiento_siga", {
    p_expediente: p.expedienteId, p_documento: p.documentoId, p_estado: ok ? "aplicado" : "rechazado",
    p_campos: ok ? p.evaluacion.decision.cambios : {}, p_procesos: ok ? p.datos.procesos : [],
    p_lectura: lecturaParaGuardar(p.datos, p.metodo, p.evaluacion, p.archivo), p_origen: p.origen,
  });
  if (error) throw new Error(error.message);
  return (data ?? { completados: [], procesos_nuevos: 0 }) as { completados: string[]; procesos_nuevos: number };
}
