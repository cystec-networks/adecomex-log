import type { SupabaseClient } from "@supabase/supabase-js";

/** Bloques de «Atención requerida» del Panel de operaciones, en su orden por defecto. */
export const GRUPOS_ALERTAS_IDS = [
  "hitos",
  "eta",
  "documentos",
  "permisos-pendientes",
  "etapa",
  "mora",
  "recepcion",
  "pin",
  "permisos",
  "transportes",
  "solicitudes",
  "plazo",
] as const;

export type GrupoAlertaId = (typeof GRUPOS_ALERTAS_IDS)[number];

/** Dos columnas con todos los bloques (también los que hoy no tienen alertas). */
export type DisposicionAlertas = [GrupoAlertaId[], GrupoAlertaId[]];

/** Identificadores de las zonas de columna para soltar al final de cada una. */
export const COLUMNAS_ALERTAS = ["columna-alertas-0", "columna-alertas-1"] as const;

/** Clave en `preferencias_usuario` (una fila por usuario, protegida por RLS). */
export const CLAVE_DISPOSICION_ALERTAS = "panel-operaciones-alertas-disposicion";

const VALIDOS = new Set<string>(GRUPOS_ALERTAS_IDS);

/** Agrega los bloques que falten, cada uno a la columna con menos bloques. */
function completar(columnas: DisposicionAlertas): DisposicionAlertas {
  const vistos = new Set([...columnas[0], ...columnas[1]]);
  for (const id of GRUPOS_ALERTAS_IDS) {
    if (vistos.has(id)) continue;
    columnas[columnas[0].length <= columnas[1].length ? 0 : 1].push(id);
  }
  return columnas;
}

/**
 * Convierte el valor guardado en una disposición completa y válida, o `null`
 * cuando el usuario nunca la personalizó (se usa el reparto automático).
 * Descarta ids desconocidos o repetidos y agrega los bloques nuevos.
 */
export function normalizarDisposicionAlertas(valor: unknown): DisposicionAlertas | null {
  const columnas = (valor as { columnas?: unknown } | null)?.columnas;
  if (!Array.isArray(columnas) || columnas.length !== 2 || !columnas.every(Array.isArray)) return null;
  const vistos = new Set<string>();
  const resultado: DisposicionAlertas = [[], []];
  columnas.forEach((col: unknown[], i) => {
    for (const id of col) {
      if (typeof id === "string" && VALIDOS.has(id) && !vistos.has(id)) {
        vistos.add(id);
        resultado[i].push(id as GrupoAlertaId);
      }
    }
  });
  return completar(resultado);
}

/**
 * Reparto automático (sin preferencia): cada bloque con alertas va a la columna
 * con menos ítems (el encabezado cuenta 1); dentro de cada columna, orden por defecto.
 */
export function disposicionAutomatica(conteos: Partial<Record<GrupoAlertaId, number>>): DisposicionAlertas {
  const visibles = GRUPOS_ALERTAS_IDS.filter((id) => (conteos[id] ?? 0) > 0);
  const columnas: DisposicionAlertas = [[], []];
  const pesos = [0, 0];
  for (const id of [...visibles].sort((a, b) => (conteos[b] ?? 0) - (conteos[a] ?? 0))) {
    const i = pesos[0] <= pesos[1] ? 0 : 1;
    columnas[i].push(id);
    pesos[i] += (conteos[id] ?? 0) + 1;
  }
  const pos = (id: GrupoAlertaId) => GRUPOS_ALERTAS_IDS.indexOf(id);
  columnas.forEach((c) => c.sort((a, b) => pos(a) - pos(b)));
  return completar(columnas);
}

/** Disposición efectiva: la guardada por el usuario o, si no hay, la automática. */
export function disposicionEfectiva(
  guardada: DisposicionAlertas | null,
  conteos: Partial<Record<GrupoAlertaId, number>>,
): DisposicionAlertas {
  return guardada ? [[...guardada[0]], [...guardada[1]]] : disposicionAutomatica(conteos);
}

/** Bloques de cada columna que tienen alertas, en el orden de la disposición. */
export function columnasVisibles(
  disposicion: DisposicionAlertas,
  conteos: Partial<Record<GrupoAlertaId, number>>,
): DisposicionAlertas {
  return [
    disposicion[0].filter((id) => (conteos[id] ?? 0) > 0),
    disposicion[1].filter((id) => (conteos[id] ?? 0) > 0),
  ];
}

function columnaDe(disposicion: DisposicionAlertas, id: string): 0 | 1 | -1 {
  if (id === COLUMNAS_ALERTAS[0]) return 0;
  if (id === COLUMNAS_ALERTAS[1]) return 1;
  if (disposicion[0].includes(id as GrupoAlertaId)) return 0;
  if (disposicion[1].includes(id as GrupoAlertaId)) return 1;
  return -1;
}

/**
 * Mueve el bloque `activo` a la posición del bloque `destino`, en la misma u
 * otra columna; si `destino` es una columna, lo deja al final de ella.
 * Los bloques sin alertas conservan su lugar relativo.
 */
export function moverGrupoAlertas(
  disposicion: DisposicionAlertas,
  activo: string,
  destino: string,
  /** Al cruzar de columna, insertar debajo del destino (el puntero pasó su mitad). */
  despues = false,
): DisposicionAlertas {
  const desde = columnaDe(disposicion, activo);
  const hacia = columnaDe(disposicion, destino);
  if (desde === -1 || hacia === -1 || activo === destino || COLUMNAS_ALERTAS.includes(activo as never)) return disposicion;
  const columnas: DisposicionAlertas = [[...disposicion[0]], [...disposicion[1]]];
  const id = activo as GrupoAlertaId;
  const indiceOrigen = columnas[desde].indexOf(id);
  const esColumna = COLUMNAS_ALERTAS.includes(destino as never);
  if (desde === hacia && esColumna) {
    if (indiceOrigen === columnas[desde].length - 1) return disposicion;
    columnas[desde].splice(indiceOrigen, 1);
    columnas[desde].push(id);
    return columnas;
  }
  // En la misma columna toma exactamente la posición del destino (como los KPI).
  const indiceDestino = esColumna ? columnas[hacia].length : columnas[hacia].indexOf(destino as GrupoAlertaId);
  columnas[desde].splice(indiceOrigen, 1);
  const cruza = desde !== hacia;
  columnas[hacia].splice(esColumna ? columnas[hacia].length : indiceDestino + (cruza && despues ? 1 : 0), 0, id);
  return columnas;
}

export function mismaDisposicion(a: DisposicionAlertas, b: DisposicionAlertas): boolean {
  return a.every((col, i) => col.length === b[i].length && col.every((id, j) => id === b[i][j]));
}

export async function leerDisposicionAlertas(supabase: SupabaseClient<any>, userId: string): Promise<DisposicionAlertas | null> {
  const { data, error } = await supabase
    .from("preferencias_usuario")
    .select("valor")
    .eq("user_id", userId)
    .eq("clave", CLAVE_DISPOSICION_ALERTAS)
    .maybeSingle();
  if (error) throw error;
  return normalizarDisposicionAlertas(data?.valor);
}

/** Guarda la disposición del usuario; `null` la borra y vuelve al reparto automático. */
export async function guardarDisposicionAlertas(
  supabase: SupabaseClient<any>,
  userId: string,
  disposicion: DisposicionAlertas | null,
): Promise<void> {
  if (!disposicion) {
    const { error } = await supabase.from("preferencias_usuario").delete().eq("user_id", userId).eq("clave", CLAVE_DISPOSICION_ALERTAS);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("preferencias_usuario")
    .upsert(
      { user_id: userId, clave: CLAVE_DISPOSICION_ALERTAS, valor: { columnas: normalizarDisposicionAlertas({ columnas: disposicion }) } },
      { onConflict: "user_id,clave" },
    );
  if (error) throw error;
}
