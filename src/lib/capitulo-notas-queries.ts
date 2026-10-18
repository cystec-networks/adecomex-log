import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const notasCapituloOptions = (capitulo: number) => queryOptions({
  queryKey: ["capitulo-notas", capitulo],
  queryFn: async () => {
    const [notas, titulo] = await Promise.all([
      supabase.from("capitulo_notas").select("*").eq("capitulo", capitulo).maybeSingle(),
      supabase.from("catalogo_arancelario").select("capitulo_titulo").eq("capitulo", capitulo).eq("activo", true).order("codigo").limit(1).maybeSingle(),
    ]);
    if (notas.error) throw notas.error;
    if (titulo.error) throw titulo.error;
    return { nota: notas.data, titulo: titulo.data?.capitulo_titulo ?? "" };
  },
});