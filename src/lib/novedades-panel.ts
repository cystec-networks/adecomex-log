// Categoría «Novedades relevantes» de «Atención requerida» (Panel de operaciones).
// Lee solo con el cliente del usuario (RLS): novedades Alta/Media recientes que
// el propio usuario no ha marcado como vistas. «Vista» es por usuario y nunca
// borra la novedad de la lista de Novedades.
import type { SupabaseClient } from "@supabase/supabase-js";

import { DIAS_NOVEDADES_PANEL, novedadEnPanel } from "./novedades-comercio";

export type NovedadPanel = {
  id: string;
  titulo: string;
  fuente_nombre: string;
  url: string;
  fecha_publicacion: string | null;
  fecha_captura: string;
  impacto: string | null;
  sectores: string[];
  relevancia: string | null;
};

const PESO: Record<string, number> = { Alta: 0, Media: 1 };
const diaOrden = (n: NovedadPanel) => n.fecha_publicacion ?? n.fecha_captura.slice(0, 10);

/** Alta antes que Media; dentro de cada una, la más reciente primero. */
export function ordenarNovedadesPanel(lista: NovedadPanel[]): NovedadPanel[] {
  return [...lista].sort(
    (a, b) =>
      (PESO[a.relevancia ?? ""] ?? 9) - (PESO[b.relevancia ?? ""] ?? 9) ||
      diaOrden(b).localeCompare(diaOrden(a)) ||
      b.fecha_captura.localeCompare(a.fecha_captura),
  );
}

export async function obtenerNovedadesPanel(
  supabase: SupabaseClient<any>,
  userId: string,
  hoy = new Date(),
): Promise<NovedadPanel[]> {
  // Una publicación es siempre anterior a su registro: basta con lo registrado
  // en la ventana (+1 día de margen por zona horaria) y se filtra por fecha exacta abajo.
  const desde = new Date(hoy.getTime() - (DIAS_NOVEDADES_PANEL + 1) * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("novedades_comercio_exterior")
    .select("id, titulo, fuente_nombre, url, fecha_publicacion, fecha_captura, impacto, sectores, relevancia")
    .in("relevancia", ["Alta", "Media"])
    .gte("fecha_captura", desde)
    .limit(200);
  if (error) throw error;
  const filas = (data ?? []) as NovedadPanel[];
  if (filas.length === 0) return [];
  const { data: vistas, error: errVistas } = await supabase
    .from("novedades_vistas")
    .select("novedad_id")
    .eq("user_id", userId)
    .in(
      "novedad_id",
      filas.map((n) => n.id),
    );
  if (errVistas) throw errVistas;
  const vistasSet = new Set((vistas ?? []).map((v: { novedad_id: string }) => v.novedad_id));
  return ordenarNovedadesPanel(filas.filter((n) => novedadEnPanel(n, hoy, vistasSet.has(n.id))));
}

/** Marca novedades como vistas para el usuario (deja de verlas en su Panel). */
export async function marcarNovedadesVistas(
  supabase: SupabaseClient<any>,
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("novedades_vistas")
    .upsert(
      ids.map((novedad_id) => ({ user_id: userId, novedad_id })),
      { onConflict: "user_id,novedad_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}
