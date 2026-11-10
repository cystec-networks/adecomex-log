/** Lecturas y acciones del registro de correos recibidos, siempre bajo RLS del personal. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MINUTOS_PROCESANDO_ATASCADO, propuestasPendientes, type CampoPropuesto, type Propuestas } from "@/lib/correo-expediente";

type Db = SupabaseClient<Database>;
export type CorreoRecibido = Database["public"]["Tables"]["correos_recibidos"]["Row"];

export const RESULTADO_CORREO: Record<string, { etiqueta: string; tono: "ok" | "info" | "aviso" | "error" }> = {
  creada: { etiqueta: "Solicitud creada", tono: "ok" },
  actualizada: { etiqueta: "Solicitud actualizada", tono: "ok" },
  adjuntada: { etiqueta: "Adjuntado a Expediente", tono: "info" },
  descartada: { etiqueta: "Descartado", tono: "aviso" },
  error: { etiqueta: "Error", tono: "error" },
  procesando: { etiqueta: "Procesando", tono: "aviso" },
};

/** Un «procesando» sin cierre tras unos minutos se trata como fallo: el proceso se interrumpió. */
export function correoAtascado(c: Pick<CorreoRecibido, "resultado" | "ultimo_intento_at">, ahora = Date.now()) {
  return c.resultado === "procesando" && ahora - new Date(c.ultimo_intento_at).getTime() > MINUTOS_PROCESANDO_ATASCADO * 60_000;
}

export const esFalloCorreo = (c: Pick<CorreoRecibido, "resultado" | "ultimo_intento_at">, ahora = Date.now()) =>
  c.resultado === "error" || correoAtascado(c, ahora);

/** Alertas del Panel: correos con error (o interrumpidos) y documentos nuevos llegados a Expedientes. */
export async function obtenerAlertasCorreo(db: Db) {
  const limiteAtasco = new Date(Date.now() - MINUTOS_PROCESANDO_ATASCADO * 60_000).toISOString();
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [errores, documentos] = await Promise.all([
    db.from("correos_recibidos").select("*").is("alerta_vista_en", null)
      .or(`resultado.eq.error,and(resultado.eq.procesando,ultimo_intento_at.lt.${limiteAtasco})`)
      .order("ultimo_intento_at", { ascending: false }).limit(50),
    db.from("correos_recibidos").select("*").is("alerta_vista_en", null).eq("resultado", "adjuntada")
      .gte("created_at", desde).order("created_at", { ascending: false }).limit(50),
  ]);
  if (errores.error) throw errores.error;
  if (documentos.error) throw documentos.error;
  return { errores: errores.data ?? [], documentos: documentos.data ?? [] };
}

export async function marcarAlertasCorreoVistas(db: Db, ids: string[], userId: string) {
  if (!ids.length) return;
  const { error } = await db.from("correos_recibidos").update({ alerta_vista_en: new Date().toISOString(), alerta_vista_por: userId }).in("id", ids);
  if (error) throw error;
}

export async function correosDeExpediente(db: Db, expedienteId: string) {
  const { data, error } = await db.from("correos_recibidos").select("*").eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function registroCorreos(db: Db, filtro: string) {
  let q = db.from("correos_recibidos").select("*").order("ultimo_intento_at", { ascending: false }).limit(200);
  if (filtro === "error") q = q.in("resultado", ["error", "procesando"]);
  else if (filtro !== "todos") q = q.eq("resultado", filtro);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function guardarEstadoPropuesta(db: Db, registroId: string, campo: CampoPropuesto, estado: "aplicada" | "descartada") {
  const { data, error } = await db.from("correos_recibidos").select("propuestas").eq("id", registroId).single();
  if (error) throw error;
  const actual = (data?.propuestas ?? {}) as Propuestas;
  if (!actual[campo]) return;
  const nuevas = { ...actual, [campo]: { ...actual[campo]!, estado } };
  const { error: e2 } = await db.from("correos_recibidos").update({ propuestas: nuevas as any }).eq("id", registroId);
  if (e2) throw e2;
}

/**
 * Aplica un dato propuesto solo si el campo del Expediente sigue vacío; si ya se cargó
 * otro valor, no se sobrescribe y la propuesta queda descartada.
 */
export async function aplicarPropuestaCorreo(db: Db, registro: Pick<CorreoRecibido, "id" | "expediente_id" | "propuestas">, campo: CampoPropuesto) {
  const propuesta = propuestasPendientes(registro.propuestas).find(([c]) => c === campo)?.[1];
  if (!propuesta || !registro.expediente_id) throw new Error("La propuesta ya no está pendiente");
  let q = db.from("expedientes").update({ [campo]: propuesta.valor } as any).eq("id", registro.expediente_id);
  q = campo === "fecha_llegada_real" ? q.is(campo, null) : q.or(`${campo}.is.null,${campo}.eq.""`);
  const { data, error } = await q.select("id");
  if (error) throw error;
  if (!data?.length) {
    await guardarEstadoPropuesta(db, registro.id, campo, "descartada");
    return { aplicada: false as const };
  }
  await guardarEstadoPropuesta(db, registro.id, campo, "aplicada");
  return { aplicada: true as const };
}

export const descartarPropuestaCorreo = (db: Db, registroId: string, campo: CampoPropuesto) => guardarEstadoPropuesta(db, registroId, campo, "descartada");
