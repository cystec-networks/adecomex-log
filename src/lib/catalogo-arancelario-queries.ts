import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeSearchTerm, patronSinTildes } from "@/lib/search-filter";
import type { QueryClient } from "@tanstack/react-query";
import { resolverSugerenciasProducto, type TasasProducto } from "@/lib/catalogo-arancelario";

export async function buscarSugerenciasProducto(qc: QueryClient, codigo: string, manual: TasasProducto = {}) {
  const arancel = await qc.fetchQuery(arancelCodigoOptions(codigo));
  let historial = null;
  if (!arancel && codigo.trim()) {
    const { data, error } = await supabase.from("catalogo_tasas_arancelarias").select("pct_gravamen,aplica_isc,pct_isc,pct_itbis").eq("codigo_arancelario", codigo.trim()).maybeSingle();
    if (error) throw error;
    historial = data;
  }
  return resolverSugerenciasProducto(manual, arancel, historial);
}

export const arancelConsultaOptions = (q = "", capitulo = "todos", seccion = "todas", pagina = 0) => queryOptions({
  queryKey: ["catalogo-arancelario", "consulta", q, capitulo, seccion, pagina],
  queryFn: async () => {
    let query = supabase.from("catalogo_arancelario").select("*", { count: "exact" }).eq("activo", true);
    const term = sanitizeSearchTerm(q);
    if (term) {
      const codigo = q.replace(/[^0-9.]/g, "");
      const digitos = codigo.replace(/\./g, "");
      const puntos = digitos.length <= 4 ? digitos : `${digitos.slice(0, 4)}.${digitos.slice(4).match(/.{1,2}/g)?.join(".") ?? ""}`;
      query = /^\d[\d.\s]*$/.test(q.trim())
        ? query.or(`codigo.ilike.${codigo}%,codigo.ilike.${digitos}%,codigo.ilike.${puntos}%,codigo_partida.ilike.${digitos}%`)
        : query.ilike("descripcion", patronSinTildes(term));
    }
    if (capitulo !== "todos") query = query.eq("capitulo", Number(capitulo));
    if (seccion !== "todas") query = query.eq("seccion", seccion);
    const { data, error, count } = await query.order("codigo").range(pagina * 100, pagina * 100 + 99);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  },
});

export const arancelCodigoOptions = (codigo: string) => queryOptions({
  queryKey: ["catalogo-arancelario", "codigo", codigo.replace(/\./g, "").trim()],
  enabled: Boolean(codigo.trim()),
  queryFn: async () => {
    const digitos = codigo.replace(/[^0-9]/g, "");
    if (![4, 6, 8, 10].includes(digitos.length)) return null;
    const puntos = `${digitos.slice(0, 4)}${digitos.slice(4).replace(/(..)/g, ".$1")}`;
    const { data, error } = await supabase.from("catalogo_arancelario").select("*").eq("activo", true).in("codigo", [digitos, puntos]).limit(2);
    if (error) throw error;
    return data?.find((r) => r.codigo === codigo.trim()) ?? data?.[0] ?? null;
  },
});
export const arancelPuntos = (digitos: string) => `${digitos.slice(0, 4)}${digitos.slice(4).replace(/(..)/g, ".$1")}`;

/** Lookup en lote: devuelve mapa dígitos → fila del arancel (para listados). */
export const arancelPorCodigosOptions = (codigos: string[]) => {
  const digitos = [...new Set(codigos.map((c) => (c ?? "").replace(/[^0-9]/g, "")).filter((d) => [4, 6, 8, 10].includes(d.length)))].sort();
  return queryOptions({
    queryKey: ["catalogo-arancelario", "lote", digitos],
    enabled: digitos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogo_arancelario").select("codigo,gravamen_pct,exento_itbis").eq("activo", true).in("codigo", [...digitos, ...digitos.map(arancelPuntos)]);
      if (error) throw error;
      const mapa: Record<string, { codigo: string; gravamen_pct: number | null; exento_itbis: boolean | null }> = {};
      for (const r of data ?? []) mapa[r.codigo.replace(/\./g, "")] = r as any;
      return mapa;
    },
  });
};
