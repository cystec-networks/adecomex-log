import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { nombreArchivo } from "@/lib/codigo-siga";
import { etiquetaActualizado, fmtFechaHora, fueReemplazado, textoOrigen, tooltipActualizado } from "@/lib/documento-versiones";

type DocVersionado = {
  id: string; tipo: string; storage_path?: string | null; codigo_siga?: string | null; created_at?: string | null;
  creado_por?: string | null; actualizado_en?: string | null; actualizado_por?: string | null; actualizado_origen?: string | null;
};

/** Nombres de perfiles (staff) para mostrar quién subió o reemplazó cada versión. */
export function useNombresUsuarios(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))].sort();
  const { data } = useQuery({
    queryKey: ["nombres-usuarios", unicos],
    enabled: unicos.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,nombre,email").in("id", unicos);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nombre || p.email || "Usuario"])) as Record<string, string>;
    },
  });
  return data ?? {};
}

export function ActualizadoBadge({ doc, nombres }: { doc: DocVersionado; nombres: Record<string, string> }) {
  if (!fueReemplazado(doc)) return null;
  return (
    <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal whitespace-nowrap cursor-default" title={tooltipActualizado(doc, nombres)}>
      {etiquetaActualizado(doc)}
    </Badge>
  );
}

export function HistorialDocumentoButton({ doc, nombres }: { doc: DocVersionado; nombres: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { data: versiones, isLoading, error } = useQuery({
    queryKey: ["documento-versiones", doc.id, doc.actualizado_en],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("documento_versiones")
        .select("id,storage_path,codigo_siga,subido_en,subido_por,reemplazado_en,reemplazado_por,origen")
        .eq("documento_id", doc.id).order("reemplazado_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const nombresVersiones = useNombresUsuarios((versiones ?? []).flatMap((v) => [v.subido_por, v.reemplazado_por]));
  const quien = (id: string | null | undefined) => (id ? nombresVersiones[id] ?? nombres[id] ?? "Usuario" : "—");
  if (!fueReemplazado(doc)) return null;
  return (
    <>
      <Button variant="link" size="sm" className="h-5 px-1 text-[11px]" onClick={() => setOpen(true)} title="Ver versiones anteriores">
        <History className="h-3 w-3 mr-0.5" />Historial
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial · {doc.tipo}</DialogTitle>
            <DialogDescription>Versiones del archivo, de la más reciente a la más antigua.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-muted-foreground border-b">
                <tr><th className="text-left py-1 pr-2">Versión</th><th className="text-left pr-2">Subida</th><th className="text-left pr-2">Usuario</th><th className="text-left pr-2">Archivo</th><th /></tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-1 pr-2"><Badge className="h-4 px-1 text-[10px]">Actual</Badge></td>
                  <td className="pr-2 whitespace-nowrap">{fmtFechaHora(doc.actualizado_en)}</td>
                  <td className="pr-2">{quien(doc.actualizado_por)}{textoOrigen(doc.actualizado_origen) ? <span className="text-muted-foreground"> · {textoOrigen(doc.actualizado_origen)}</span> : null}</td>
                  <td className="pr-2 max-w-[14rem] truncate" title={nombreArchivo(doc.storage_path)}>{nombreArchivo(doc.storage_path)}</td>
                  <td className="text-right">{doc.storage_path && <DocumentoPreviewButton path={doc.storage_path} variant="ghost" size="sm" label="Ver" />}</td>
                </tr>
                {(versiones ?? []).map((v, i) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 text-muted-foreground">{(versiones?.length ?? 0) - i === 1 ? "Original" : `Anterior ${(versiones?.length ?? 0) - i}`}</td>
                    <td className="pr-2 whitespace-nowrap" title={`Reemplazada el ${fmtFechaHora(v.reemplazado_en)} por ${quien(v.reemplazado_por)}`}>{fmtFechaHora(v.subido_en)}</td>
                    <td className="pr-2">{quien(v.subido_por)}</td>
                    <td className="pr-2 max-w-[14rem] truncate" title={nombreArchivo(v.storage_path)}>{nombreArchivo(v.storage_path)}</td>
                    <td className="text-right"><DocumentoPreviewButton path={v.storage_path} variant="ghost" size="sm" label="Ver" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isLoading && <p className="text-[12px] text-muted-foreground py-2">Cargando versiones…</p>}
            {error && <p className="text-[12px] text-destructive py-2">No se pudo cargar el historial.</p>}
            {!isLoading && !error && versiones?.length === 0 && <p className="text-[12px] text-muted-foreground py-2">No hay versiones anteriores guardadas.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
