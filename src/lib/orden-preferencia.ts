import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Orden personal de elementos (tarjetas, columnas…) guardado en
 * `preferencias_usuario` (una fila por usuario y clave, protegida por RLS).
 */

/**
 * Convierte un valor guardado en un orden completo y válido: descarta ids
 * desconocidos o repetidos y agrega al final (en su orden por defecto) los
 * que falten, p. ej. cuando se incorpora una columna nueva.
 */
export function normalizarOrden<T extends string>(valor: unknown, ids: readonly T[]): T[] {
  const validos = new Set<string>(ids);
  const resultado: T[] = [];
  if (Array.isArray(valor)) {
    for (const id of valor) {
      if (typeof id === "string" && validos.has(id) && !resultado.includes(id as T)) resultado.push(id as T);
    }
  }
  for (const id of ids) if (!resultado.includes(id)) resultado.push(id);
  return resultado;
}

/** Mueve `activo` a la posición que ocupa `destino`. Sin cambios si alguno no existe. */
export function moverEnOrden<T extends string>(orden: T[], activo: string, destino: string): T[] {
  const desde = orden.indexOf(activo as T);
  const hasta = orden.indexOf(destino as T);
  if (desde < 0 || hasta < 0 || desde === hasta) return orden;
  const copia = [...orden];
  const [item] = copia.splice(desde, 1);
  copia.splice(hasta, 0, item);
  return copia;
}

export function esOrdenPorDefecto(orden: readonly string[], ids: readonly string[]): boolean {
  return orden.length === ids.length && orden.every((id, i) => id === ids[i]);
}

export async function leerOrdenPreferencia<T extends string>(
  supabase: SupabaseClient<any>,
  userId: string,
  clave: string,
  ids: readonly T[],
): Promise<T[]> {
  const { data, error } = await supabase
    .from("preferencias_usuario")
    .select("valor")
    .eq("user_id", userId)
    .eq("clave", clave)
    .maybeSingle();
  if (error) throw error;
  return normalizarOrden(data?.valor, ids);
}

export async function guardarOrdenPreferencia<T extends string>(
  supabase: SupabaseClient<any>,
  userId: string,
  clave: string,
  ids: readonly T[],
  orden: T[],
): Promise<void> {
  const { error } = await supabase
    .from("preferencias_usuario")
    .upsert({ user_id: userId, clave, valor: normalizarOrden(orden, ids) }, { onConflict: "user_id,clave" });
  if (error) throw error;
}
