import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { candidatosCodigoCopiloto, filaClasificacionSchema, type FilaClasificacion } from "./copiloto-facturas";

export const arancelCopilotoOptions = (codigos: string[]) => {
  const digitos = [...new Set(codigos.flatMap(candidatosCodigoCopiloto))].sort();
  return queryOptions({
    queryKey: ["copiloto-arancel", digitos],
    queryFn: async () => {
      if (!digitos.length) return [];
      const puntos = digitos.map((d) => `${d.slice(0, 4)}${d.slice(4).replace(/(..)/g, ".$1")}`);
      const { data, error } = await supabase.from("catalogo_arancelario")
        .select("codigo,gravamen_pct,exento_itbis,es_hoja").eq("activo", true).in("codigo", [...digitos, ...puntos]);
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const historialCopilotoOptions = queryOptions({
  queryKey: ["copiloto-historial"],
  queryFn: async () => {
    const { data, error } = await supabase.from("copiloto_clasificaciones").select("id,archivo,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const clasificacionGuardadaOptions = (id: string) => queryOptions({
  queryKey: ["copiloto-historial", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("copiloto_clasificaciones").select("*").eq("id", id).single();
    if (error) throw error;
    return { ...data, lineas: filaClasificacionSchema.array().parse(data.lineas) };
  },
});

export async function guardarClasificacion(archivo: string, filas: FilaClasificacion[]) {
  const lineas = filaClasificacionSchema.array().min(1).parse(filas);
  const { data, error } = await supabase.from("copiloto_clasificaciones").insert({ archivo, lineas }).select("id").single();
  if (error) throw error;
  return data;
}