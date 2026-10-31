import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatoTamanoArchivo } from "@/lib/documento-tamano";

/** Metadata only: handles every upload source and existing documents without downloading PDFs. */
export function DocumentoTamano({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["documento-tamano", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("documentos").info(path);
      if (error) return null;
      return formatoTamanoArchivo(data?.size);
    },
    staleTime: 60_000,
    retry: false,
  });
  return data ? <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground" aria-label={`Tamaño del archivo: ${data}`}>— {data}</span> : null;
}