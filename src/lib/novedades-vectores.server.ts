// Vectores de las novedades para que el Asistente busque solo las relacionadas con la pregunta.
// Solo servidor (cliente de servicio). Lotes acotados; una novedad editada vuelve a vectorizarse.
import { textoVectorNovedad } from "./asistente-contexto";
import { vectorizar, vectorTexto } from "./embeddings.server";

export async function vectorizarNovedadesPendientes(max = 25): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("novedades_comercio_exterior")
    .select("id,titulo,resumen,categoria,fuente_nombre").is("embedding", null)
    .order("created_at", { ascending: false }).limit(Math.max(1, Math.min(max, 100)));
  if (error) throw new Error(`No se pudieron leer las novedades: ${error.message}`);
  if (!data?.length) return 0;
  const vectores = await vectorizar(data.map(textoVectorNovedad));
  let hechas = 0;
  for (const [i, n] of data.entries()) {
    const { error: e } = await db.from("novedades_comercio_exterior").update({ embedding: vectorTexto(vectores[i]) }).eq("id", n.id);
    if (e) console.error("[novedades] no se pudo guardar el vector", n.id, e.message);
    else hechas++;
  }
  return hechas;
}
