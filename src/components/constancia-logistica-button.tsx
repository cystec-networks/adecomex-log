import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildConstanciaLogisticaPdf, type ConstanciaInput } from "@/lib/pdf-constancia-logistica";

/** Botón + vista previa de la "Constancia de Inicio de Gestión Logística". */
export function ConstanciaLogisticaButton({ datos }: { datos: () => ConstanciaInput }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef("Constancia.pdf");

  const cerrar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const generar = async () => {
    try {
      const input = datos();
      const doc = await buildConstanciaLogisticaPdf(input);
      docRef.current = doc;
      fileNameRef.current = `CONSTANCIA DE GESTION LOGISTICA ${input.numero}.pdf`;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(doc.output("bloburl").toString());
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar la constancia");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        Generar Constancia (PDF)
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Constancia de Inicio de Gestión Logística</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Constancia de Inicio de Gestión Logística" className="w-full h-full border-0" />}
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

export default ConstanciaLogisticaButton;
