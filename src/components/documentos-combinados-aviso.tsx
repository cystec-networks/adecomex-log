import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reanudarDocumentoCombinado } from "@/lib/documentos-combinados.functions";
import { AVISO_PROCESANDO_COMBINADO } from "@/lib/correo-documento-combinado";

export type DocumentoCombinado = { id: string; solicitud_id: string | null; expediente_id: string | null; nombre: string; estado: string; intentos: number; created_at: string; bloqueado_hasta: string | null; resultado: { nombre: string; tipo: string }[]; error: string | null };

/** Estado de los PDFs combinados; consulta cada 8 s mientras haya trabajo y avisa al terminar. */
export function useDocumentosCombinados(filtro: { solicitudIds?: string[]; expedienteId?: string | null }) {
  const qc = useQueryClient();
  const ids = (filtro.solicitudIds ?? []).filter(Boolean).sort();
  const habilitado = ids.length > 0 || !!filtro.expedienteId;
  const q = useQuery({
    queryKey: ["documentos-combinados", ids.join(","), filtro.expedienteId ?? ""],
    enabled: habilitado,
    queryFn: async () => {
      let consulta = (supabase as any).from("correo_documentos_combinados").select("id,solicitud_id,expediente_id,nombre,estado,intentos,created_at,bloqueado_hasta,resultado,error").order("created_at");
      if (filtro.expedienteId && ids.length) consulta = consulta.or(`expediente_id.eq.${filtro.expedienteId},solicitud_id.in.(${ids.join(",")})`);
      else if (filtro.expedienteId) consulta = consulta.eq("expediente_id", filtro.expedienteId);
      else consulta = consulta.in("solicitud_id", ids);
      const { data, error } = await consulta;
      if (error) throw error;
      return (data ?? []) as DocumentoCombinado[];
    },
    refetchInterval: (query) => ((query.state.data as DocumentoCombinado[] | undefined) ?? []).some((d) => d.estado === "pendiente" || d.estado === "procesando") ? 8000 : false,
  });
  const previos = useRef(new Map<string, string>());
  const reanudados = useRef(new Set<string>());
  useEffect(() => {
    for (const d of q.data ?? []) {
      const antes = previos.current.get(d.id);
      if (antes && antes !== d.estado) {
        if (d.estado === "completado") {
          toast.success(`Documento combinado procesado: ${d.nombre}`, { description: `${d.resultado?.length ?? 0} documento(s) identificados: ${(d.resultado ?? []).map((r) => r.tipo === "Otro" ? "Otros" : r.tipo).join(", ")}` });
          qc.invalidateQueries({ queryKey: ["solicitudes-correo"] });
          qc.invalidateQueries({ queryKey: ["documentos"] });
        } else if (d.estado === "error") toast.error(`No se pudo separar ${d.nombre}; queda en Otros documentos.`);
      }
      previos.current.set(d.id, d.estado);
      // Respaldo si el aviso automático no llegó o el proceso quedó a medias.
      const atascado = (d.estado === "pendiente" && Date.now() - new Date(d.created_at).getTime() > 45_000)
        || (d.estado === "procesando" && d.bloqueado_hasta && new Date(d.bloqueado_hasta).getTime() < Date.now());
      if (atascado && d.intentos < 3 && !reanudados.current.has(d.id)) {
        reanudados.current.add(d.id);
        reanudarDocumentoCombinado({ data: { id: d.id } }).then(() => q.refetch()).catch(() => {});
      }
    }
  }, [q.data]);
  return q.data ?? [];
}

export function AvisoDocumentosCombinados({ documentos }: { documentos: DocumentoCombinado[] }) {
  const activos = documentos.filter((d) => d.estado === "pendiente" || d.estado === "procesando");
  if (!activos.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[12px]">
      {activos.map((d) => (
        <div key={d.id} className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>{AVISO_PROCESANDO_COMBINADO} <span className="text-muted-foreground">{d.nombre}</span></span>
        </div>
      ))}
    </div>
  );
}
