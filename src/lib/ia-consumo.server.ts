// Registro, caché y topes de IA (solo servidor). Nunca bloquea una lectura por fallar el registro.
import { costoEstimadoIa, FUNCIONES_LECTURA_CORREO, nombreFuncionIa, topeBloquea, type FuncionIa } from "./ia-consumo";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Id del usuario de un encabezado «Authorization: Bearer …» ya validado (solo para el registro). */
export function usuarioDeAutorizacion(auth: string | null | undefined): string | null {
  try {
    const token = (auth ?? "").toLowerCase().startsWith("bearer ") ? (auth ?? "").slice(7).trim() : "";
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return typeof json.sub === "string" && /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

/** Usuario de la solicitud actual (token ya validado por la ruta o función); webhooks y tareas = sin usuario. */
async function usuarioActual(): Promise<string | null> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return usuarioDeAutorizacion(getRequestHeader("authorization"));
  } catch {
    return null;
  }
}

export async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registrarConsumoIa(r: {
  funcion: FuncionIa; modelo: string; tokensEntrada?: number; tokensSalida?: number; reutilizado?: boolean; viaTexto?: boolean; usuarioId?: string | null;
}) {
  try {
    const tokensEntrada = Math.max(0, Math.round(r.tokensEntrada ?? 0));
    const tokensSalida = Math.max(0, Math.round(r.tokensSalida ?? 0));
    const db = await admin();
    await db.from("ia_consumo").insert({
      funcion: r.funcion, modelo: r.modelo, tokens_entrada: tokensEntrada, tokens_salida: tokensSalida,
      costo_estimado: r.reutilizado ? 0 : costoEstimadoIa(r.modelo, tokensEntrada, tokensSalida),
      usuario_id: r.usuarioId !== undefined ? r.usuarioId : await usuarioActual(),
      reutilizado: !!r.reutilizado, via_texto: !!r.viaTexto,
    });
    // Una llamada exitosa demuestra que vuelve a haber créditos: retirar el aviso (en cualquier instancia).
    if (!r.reutilizado) {
      await db.from("ia_configuracion").update({ creditos_agotados_at: null, creditos_agotados_mensaje: null })
        .eq("singleton", true).not("creditos_agotados_at", "is", null);
    }
  } catch (e) {
    console.error("[ia] no se pudo registrar el consumo", e instanceof Error ? e.message : e);
  }
}

/** Lovable respondió créditos agotados o uso bloqueado: aviso inmediato en el Panel. */
export async function marcarCreditosAgotados(mensaje: string) {
  try {
    const db = await admin();
    await db.from("ia_configuracion").upsert({ singleton: true, creditos_agotados_at: new Date().toISOString(), creditos_agotados_mensaje: mensaje.slice(0, 300) }, { onConflict: "singleton" });
  } catch (e) {
    console.error("[ia] no se pudo marcar créditos agotados", e instanceof Error ? e.message : e);
  }
}

export class ErrorTopeIa extends Error {
  status = 503;
  constructor(public funcion: FuncionIa) {
    super(`Se alcanzó el límite diario de IA para «${nombreFuncionIa(funcion)}». Se reanuda mañana; un administrador puede subirlo en Consumo de IA.`);
  }
}

/** Inicio del día actual en Santo Domingo (UTC-4, sin horario de verano). */
function inicioDiaSantoDomingo(ahora = new Date()) {
  const local = new Date(ahora.getTime() - 4 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4));
}

async function gastadoHoy(db: any, funcion: FuncionIa): Promise<number> {
  const { data: filas } = await db.from("ia_consumo").select("costo_estimado").eq("funcion", funcion).gte("created_at", inicioDiaSantoDomingo().toISOString()).limit(10000);
  return (filas ?? []).reduce((s: number, f: { costo_estimado: number | string }) => s + Number(f.costo_estimado || 0), 0);
}

/** Lanza ErrorTopeIa solo si el límite diario se alcanzó y su acción es «bloqueo» (correos: solo alerta por defecto). */
export async function verificarTopeIa(funcion: FuncionIa) {
  let bloquea = false;
  try {
    const db = await admin();
    const { data } = await db.from("ia_limites").select("limite_diario, accion").eq("funcion", funcion).maybeSingle();
    const limite = data?.limite_diario != null ? Number(data.limite_diario) : null;
    if (!limite) return;
    bloquea = topeBloquea(funcion, await gastadoHoy(db, funcion), limite, data?.accion);
  } catch (e) {
    console.error("[ia] no se pudo verificar el tope", e instanceof Error ? e.message : e);
    return;
  }
  if (bloquea) throw new ErrorTopeIa(funcion);
}

export type CausaPausaIa = "limite_ia" | "creditos_ia";

/** Error que detiene la IA por límite diario o por créditos agotados (no es un fallo del documento). */
export function causaPausaIa(e: unknown): CausaPausaIa | null {
  if (e instanceof ErrorTopeIa) return "limite_ia";
  if (e && typeof e === "object" && (e as { creditosAgotados?: unknown }).creditosAgotados === true) return "creditos_ia";
  return null;
}

/**
 * ¿La lectura de PDF de correos está detenida? «limite_ia» si alguna función de lectura llegó a su
 * límite con acción «bloqueo»; «creditos_ia» si Lovable respondió créditos agotados. null = puede leer.
 */
export async function pausaLecturaCorreos(): Promise<CausaPausaIa | null> {
  try {
    const db = await admin();
    const [{ data: cfg }, { data: limites }] = await Promise.all([
      db.from("ia_configuracion").select("creditos_agotados_at").eq("singleton", true).maybeSingle(),
      db.from("ia_limites").select("funcion, limite_diario, accion").in("funcion", [...FUNCIONES_LECTURA_CORREO]),
    ]);
    for (const l of limites ?? []) {
      const limite = l.limite_diario != null ? Number(l.limite_diario) : null;
      if (!limite) continue;
      if (topeBloquea(l.funcion, await gastadoHoy(db, l.funcion), limite, l.accion)) return "limite_ia";
    }
    if (cfg?.creditos_agotados_at) return "creditos_ia";
    return null;
  } catch (e) {
    console.error("[ia] no se pudo leer la pausa de correos", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function leerCacheIa(clave: string): Promise<{ resultado: string; modelo: string } | null> {
  try {
    const db = await admin();
    const { data } = await db.from("ia_cache").select("resultado, modelo, usos").eq("clave", clave).maybeSingle();
    if (!data) return null;
    await db.from("ia_cache").update({ usado_at: new Date().toISOString(), usos: (data.usos ?? 0) + 1 }).eq("clave", clave);
    return { resultado: data.resultado, modelo: data.modelo };
  } catch {
    return null;
  }
}

export async function guardarCacheIa(clave: string, funcion: FuncionIa, modelo: string, resultado: string) {
  if (!resultado.trim()) return;
  try {
    const db = await admin();
    await db.from("ia_cache").upsert({ clave, funcion, modelo, resultado }, { onConflict: "clave" });
  } catch (e) {
    console.error("[ia] no se pudo guardar el resultado", e instanceof Error ? e.message : e);
  }
}
