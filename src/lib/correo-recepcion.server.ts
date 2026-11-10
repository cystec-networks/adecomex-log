/** Lecturas del servidor para relacionar un correo entrante con un Expediente (cliente de servicio). */
import { correosDeTexto, remitenteCorresponde, type CorrespondenciaRemitente } from "@/lib/correo-expediente";

type Db = any;

export type ExpedienteCorreo = {
  id: string; numero: string; bl_awb: string | null; numero_vuce: string | null; fecha_llegada_real: string | null;
  cliente_id: string | null; cliente_nombre: string | null; conocidos: string[];
};

/** Datos del Expediente y direcciones conocidas: cliente, endosatario activo y remitentes que ya escribieron sobre él. */
export async function contextoExpediente(db: Db, id: string): Promise<ExpedienteCorreo | null> {
  const { data: e, error } = await db.from("expedientes")
    .select("id,numero,bl_awb,numero_vuce,fecha_llegada_real,cliente_id,clientes(nombre,email)")
    .eq("id", id).is("eliminado_en", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer el Expediente: ${error.message}`);
  if (!e) return null;
  const [{ data: endoso }, { data: previos }] = await Promise.all([
    db.from("expediente_endosos").select("clientes!expediente_endosos_consignatario_endosado_id_fkey(email)").eq("expediente_id", id).eq("activo", true).maybeSingle(),
    db.from("solicitudes_correo").select("remitente_correo").eq("expediente_id", id).limit(50),
  ]);
  const conocidos = [...new Set([
    ...correosDeTexto(e.clientes?.email),
    ...correosDeTexto(endoso?.clientes?.email),
    ...(previos ?? []).flatMap((p: any) => correosDeTexto(p.remitente_correo)),
  ])];
  return { id: e.id, numero: e.numero, bl_awb: e.bl_awb, numero_vuce: e.numero_vuce, fecha_llegada_real: e.fecha_llegada_real,
    cliente_id: e.cliente_id, cliente_nombre: e.clientes?.nombre ?? null, conocidos };
}

let internosCache: { at: number; correos: string[] } | null = null;
/** Correos del personal interno (no portal) + el dominio de ADECOMEX, para reenvíos internos. */
export async function correosInternos(db: Db): Promise<string[]> {
  if (internosCache && Date.now() - internosCache.at < 10 * 60_000) return internosCache.correos;
  const { data } = await db.from("profiles").select("email,is_portal_account").limit(500);
  const correos = [...new Set(["operaciones@adecomex.com", ...(data ?? []).filter((p: any) => !p.is_portal_account).flatMap((p: any) => correosDeTexto(p.email))])];
  internosCache = { at: Date.now(), correos };
  return correos;
}

export async function verificarRemitente(db: Db, exp: ExpedienteCorreo, remitenteCorreo: string | null): Promise<CorrespondenciaRemitente> {
  return remitenteCorresponde(remitenteCorreo, exp.conocidos, await correosInternos(db));
}

/** ¿La dirección del remitente está registrada en algún cliente? */
export async function remitenteEsCliente(db: Db, remitenteCorreo: string | null): Promise<boolean> {
  if (!remitenteCorreo) return false;
  const { data } = await db.from("clientes").select("email").ilike("email", `%${remitenteCorreo.replace(/[%_]/g, "")}%`).limit(5);
  return (data ?? []).some((c: any) => correosDeTexto(c.email).includes(remitenteCorreo));
}

/** Expedientes activos con ese número exacto. */
export async function expedientesPorNumero(db: Db, numeros: string[]): Promise<{ id: string; numero: string }[]> {
  if (!numeros.length) return [];
  const { data, error } = await db.from("expedientes").select("id,numero").in("numero", numeros).is("eliminado_en", null);
  if (error) throw new Error(`No se pudo buscar el Expediente: ${error.message}`);
  return data ?? [];
}

/** Expedientes activos con el mismo BL sin importar espacios/guiones. */
export async function expedientesPorBl(db: Db, bl: string | null): Promise<{ id: string; numero: string }[]> {
  if (!bl) return [];
  const { data, error } = await db.rpc("buscar_expedientes_por_bl", { p_bl: bl });
  if (error) throw new Error(`No se pudo buscar el BL: ${error.message}`);
  return data ?? [];
}
