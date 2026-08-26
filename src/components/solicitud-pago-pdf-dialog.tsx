import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

/**
 * Muestra el comprobante imprimible de una solicitud de pago de transporte
 * dentro de la misma aplicación (modal), sin abrir otra pestaña del navegador.
 */
export function SolicitudPagoPdfDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [cargando, setCargando] = useState(true);

  const imprimir = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base">Comprobante de solicitud de pago</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30">
          {id && (
            <iframe
              key={id}
              ref={iframeRef}
              src={`/imprimir/solicitud-pago/${id}?embed=1`}
              title="Comprobante de solicitud de pago"
              className="w-full h-full border-0 bg-white"
              onLoad={() => setCargando(false)}
            />
          )}
          {cargando && (
            <p className="p-4 text-sm text-muted-foreground">Cargando comprobante…</p>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={imprimir}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir / Guardar PDF
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SolicitudPagoPdfDialog;
