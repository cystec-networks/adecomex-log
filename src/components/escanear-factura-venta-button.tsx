import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, FileUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  extractFacturaVentaFromDocument,
  type FacturaVentaExtraction,
} from "@/lib/ai-ocr-factura-venta.functions";

export function EscanearFacturaVentaButton({
  onExtracted,
  size = "sm",
}: {
  onExtracted: (data: FacturaVentaExtraction) => void;
  size?: "sm" | "default";
}) {
  const extractFn = useServerFn(extractFacturaVentaFromDocument);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<FacturaVentaExtraction | null>(null);

  const extract = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo PDF o imagen.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      return await extractFn({
        data: { filename: file.name, mime: file.type || "application/pdf", base64 },
      });
    },
    onSuccess: (res) => {
      setData(res);
      toast.success("Factura procesada");
    },
    onError: (e: any) => toast.error(e.message ?? "Error al procesar"),
  });

  const reset = () => {
    setFile(null);
    setData(null);
    extract.reset();
  };

  const apply = () => {
    if (!data) return;
    onExtracted(data);
    setOpen(false);
    reset();
  };

  const fmt = (v: string | number | null) =>
    v === null || v === undefined || v === "" ? <span className="text-muted-foreground">—</span> : String(v);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Sparkles className="h-4 w-4 text-accent" />
        Escanear factura de venta (IA)
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" /> Escanear factura de venta
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Archivo (PDF, JPG, PNG — máx 15MB)</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setData(null);
                }}
              />
            </div>

            {!data && (
              <Button onClick={() => extract.mutate()} disabled={!file || extract.isPending}>
                {extract.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Procesando…</>
                ) : (
                  <><FileUp className="h-4 w-4 mr-1" />Extraer datos</>
                )}
              </Button>
            )}

            {data && (
              <div className="border rounded-md p-3 bg-muted/20 space-y-2 text-sm">
                <div className="font-medium mb-1">Vista previa</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-muted-foreground">e-NCF:</span> {fmt(data.encf)}</div>
                  <div><span className="text-muted-foreground">Tipo:</span> {fmt(data.tipo_comprobante)}</div>
                  <div><span className="text-muted-foreground">Emisión:</span> {fmt(data.fecha_emision)}</div>
                  <div><span className="text-muted-foreground">Vence NCF:</span> {fmt(data.fecha_vencimiento_ncf)}</div>
                  <div><span className="text-muted-foreground">Cód. Seguridad:</span> {fmt(data.codigo_seguridad)}</div>
                  <div><span className="text-muted-foreground">Firma:</span> {fmt(data.fecha_firma)}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Cliente:</span> {fmt(data.cliente_razon_social)}</div>
                  <div><span className="text-muted-foreground">RNC cliente:</span> {fmt(data.cliente_rnc)}</div>
                  <div></div>
                  <div><span className="text-muted-foreground">Subtotal gravado:</span> {fmt(data.subtotal_gravado)}</div>
                  <div><span className="text-muted-foreground">Subtotal exento:</span> {fmt(data.subtotal_exento)}</div>
                  <div><span className="text-muted-foreground">Total ITBIS:</span> {fmt(data.total_itbis)}</div>
                  <div><span className="text-muted-foreground">Otros impuestos:</span> {fmt(data.otros_impuestos)}</div>
                  <div><span className="text-muted-foreground">Propina legal:</span> {fmt(data.propina_legal)}</div>
                  <div><span className="text-muted-foreground">MONTO TOTAL:</span> {fmt(data.monto_total)}</div>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500 pt-2 border-t">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Verifica los datos antes de guardar — la IA puede cometer errores.</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>
              Cancelar
            </Button>
            {data && (
              <Button onClick={apply}>Usar estos datos</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
