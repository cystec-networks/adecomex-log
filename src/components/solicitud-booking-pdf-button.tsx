import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildSolicitudBookingPdf, type SolicitudBookingInput } from "@/lib/pdf-solicitud-booking";

/** Genera, previsualiza y descarga la solicitud de booking de una operación logística. */
export function SolicitudBookingPdfButton({ datos }: { datos: () => Promise<SolicitudBookingInput> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const docRef = useRef<Awaited<ReturnType<typeof buildSolicitudBookingPdf>> | null>(null);
  const fileNameRef = useRef("Solicitud de Booking.pdf");

  const cerrar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const generar = async () => {
    setGenerando(true);
    try {
      const input = await datos();
      const doc = await buildSolicitudBookingPdf(input);
      docRef.current = doc;
      fileNameRef.current = `SOLICITUD BOOKING ${input.numeroOperacion || "SIN REFERENCIA"}.pdf`;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(doc.output("bloburl").toString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la Solicitud de Booking");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={generando} onClick={generar}>
        <FileText className="mr-1 h-4 w-4" />
        {generando ? "Generando…" : "Generar Solicitud de Booking (PDF)"}
      </Button>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) cerrar(); }}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="text-base">Vista previa — Solicitud de Booking</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Solicitud de Booking" className="h-full w-full border-0" />}
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

export default SolicitudBookingPdfButton;