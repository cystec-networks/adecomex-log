import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { entradasDocumentosZip, generarDocumentosZip, entregarZip, type DocumentoZip } from "@/lib/documentos-zip";

export function DescargarDocumentosZip({ expedienteId, documentos, declaracion, liquidacion }: {
  expedienteId: string; documentos: DocumentoZip[]; declaracion: string[]; liquidacion: string[];
}) {
  const [preparando, setPreparando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [listo, setListo] = useState<{ blob: Blob; nombre: string; cantidad: number } | null>(null);
  const bloqueo = useRef(false);
  const entradas = entradasDocumentosZip(documentos, declaracion, liquidacion);
  async function preparar() {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setPreparando(true);
    setProgreso(0);
    try {
      const { data, error } = await supabase.from("expedientes").select("numero").eq("id", expedienteId).single();
      if (error) throw error;
      const blob = await generarDocumentosZip(entradas, async (doc) => {
        if (!doc.storage_path) throw new Error("Documento sin archivo.");
        const { data: archivo, error: fallo } = await supabase.storage.from("documentos").download(doc.storage_path);
        if (fallo || !archivo) throw new Error(`No se pudo descargar ${doc.tipo}. Intenta nuevamente.`);
        return archivo;
      }, setProgreso);
      const numero = String(data.numero || expedienteId).replace(/[\\/:*?"<>|]/g, "_");
      setListo({ blob, nombre: `${numero} - Documentos.zip`, cantidad: entradas.length });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar el ZIP. Intenta nuevamente.");
    } finally { bloqueo.current = false; setPreparando(false); }
  }
  return <>
    <Button type="button" size="sm" variant="outline" disabled={preparando || !entradas.length} onClick={preparar}>
      {preparando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
      {preparando ? `Preparando ZIP (${progreso}/${entradas.length})…` : "Descargar todos los documentos"}
    </Button>
    <Dialog open={!!listo} onOpenChange={(open) => { if (!open) setListo(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Documentos listos para descargar</DialogTitle></DialogHeader>
        <p className="text-sm break-words">{listo?.nombre} · {listo?.cantidad} documentos</p>
        <DialogFooter><Button type="button" onClick={() => {
          if (!listo) return;
          void entregarZip(listo.blob, listo.nombre).catch(() => toast.error("No se pudo descargar el ZIP. Intenta nuevamente."));
        }}><Download className="h-4 w-4 mr-1" />Descargar ZIP</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}