import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCotizacionLogisticaPdf, type CotizacionLogisticaInput } from "@/lib/pdf-cotizacion-logistica";

/** Genera, previsualiza y descarga la cotización de servicio logístico de una operación. */
export function CotizacionLogisticaPdfButton({ datos }: { datos: () => Promise<CotizacionLogisticaInput> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const docRef = useRef<Awaited<ReturnType<typeof buildCotizacionLogisticaPdf>> | null>(null);
  const fileNameRef = useRef("Cotizacion de Servicio Logistico.pdf");

  const cerrar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const generar = async () => {
    setGenerando(true);
    try {
      const input = await datos();
      const doc = await buildCotizacionLogisticaPdf(input);
      docRef.current = doc;
      fileNameRef.current = `COTIZACION LOGISTICA ${input.numeroOperacion || "SIN REFERENCIA"}.pdf`;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(doc.output("bloburl").toString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la Cotización de Servicio Logístico");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={generando} onClick={generar}>
        <FileText className="mr-1 h-4 w-4" />
        {generando ? "Generando…" : "Generar Cotización (PDF)"}
      </Button>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) cerrar(); }}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="text-base">Vista previa — Cotización de Servicio Logístico</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Cotización de Servicio Logístico" className="h-full w-full border-0" />}
          </div>
          <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="mr-1 h-4 w-4" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrar}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CotizacionLogisticaPdfButton;
