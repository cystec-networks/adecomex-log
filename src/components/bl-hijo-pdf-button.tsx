import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildBlHijoPdf, type BlHijoInput } from "@/lib/pdf-bl-hijo";

/** Botón + vista previa del House Bill of Lading (BL Hijo) emitido por ADECOMEX. */
export function BlHijoPdfButton({ datos }: { datos: () => Promise<BlHijoInput> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef("BL Hijo.pdf");

  const cerrar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const generar = async () => {
    setGenerando(true);
    try {
      const input = await datos();
      const doc = await buildBlHijoPdf(input);
      docRef.current = doc;
      fileNameRef.current = `HOUSE BL ${input.numero || "SIN NUMERO"}.pdf`;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(doc.output("bloburl").toString());
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el BL Hijo");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={generando} onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        {generando ? "Generando…" : "Generar BL Hijo (PDF)"}
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — House Bill of Lading</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="House Bill of Lading" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrar}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BlHijoPdfButton;
