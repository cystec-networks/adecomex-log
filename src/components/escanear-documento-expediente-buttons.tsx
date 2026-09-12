import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, FileUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { extractSolicitudFromDocument, type OcrExtraction } from "@/lib/ai-ocr.functions";

function EscanearDocumentoButton({
  onExtracted,
  label,
  title,
  size = "sm",
  campos,
}: {
  onExtracted: (data: OcrExtraction) => void;
  label: string;
  title: string;
  size?: "sm" | "default";
  campos: Array<{ label: string; key: keyof OcrExtraction }>;
}) {
  const extractFn = useServerFn(extractSolicitudFromDocument);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<OcrExtraction | null>(null);

  const extract = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo PDF o imagen.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return await extractFn({
        data: { filename: file.name, mime: file.type || "application/pdf", base64: btoa(binary) },
      });
    },
    onSuccess: (res) => {
      setData(res);
      toast.success("Documento procesado");
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

  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
    if (Array.isArray(v)) return `${v.length} detectado(s)`;
    return String(v);
  };

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)} className="gap-1.5">
        <Sparkles className="h-4 w-4 text-accent" />
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" /> {title}
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
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analizando…</>
                ) : (
                  <><FileUp className="h-4 w-4 mr-1" />Extraer datos</>
                )}
              </Button>
            )}

            {data && (
              <div className="border rounded-md p-3 bg-muted/20 space-y-2 text-sm">
                <div className="font-medium mb-1">Vista previa</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {campos.map((c) => (
                    <div key={String(c.key)}>
                      <span className="text-muted-foreground">{c.label}:</span> {fmt(data[c.key])}
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500 pt-2 border-t">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Verifica los datos antes de guardar — la IA puede cometer errores.</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
            {data && <Button onClick={apply}>Usar estos datos</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EscanearBlButton({
  onExtracted,
  size,
}: {
  onExtracted: (data: OcrExtraction) => void;
  size?: "sm" | "default";
}) {
  return (
    <EscanearDocumentoButton
      onExtracted={onExtracted}
      size={size}
      label="Escanear BL/AWB"
      title="Escanear BL / AWB"
      campos={[
        { label: "BL / AWB", key: "bl" },
        { label: "Naviera", key: "naviera" },
        { label: "Puerto salida", key: "puerto_salida" },
        { label: "Puerto arribo", key: "puerto_arribo" },
        { label: "Medio", key: "medio_transporte" },
        { label: "Fecha cargado", key: "fecha_cargado" },
        { label: "ETA", key: "eta" },
        { label: "Peso bruto", key: "peso_bruto_kg" },
        { label: "Peso neto", key: "peso_neto_kg" },
        { label: "Contenedores", key: "contenedores" },
      ]}
    />
  );
}

export function EscanearFacturaButton({
  onExtracted,
  size,
}: {
  onExtracted: (data: OcrExtraction) => void;
  size?: "sm" | "default";
}) {
  return (
    <EscanearDocumentoButton
      onExtracted={onExtracted}
      size={size}
      label="Escanear Factura"
      title="Escanear factura comercial"
      campos={[
        { label: "Cliente", key: "cliente" },
        { label: "Suplidor", key: "suplidor" },
        { label: "Factura", key: "factura_comercial" },
        { label: "País origen", key: "pais_origen" },
        { label: "Incoterm", key: "incoterm" },
        { label: "FOB total", key: "fob_total" },
        { label: "Seguro", key: "seguro" },
        { label: "Flete", key: "flete" },
        { label: "Otros gastos", key: "otros_gastos" },
        { label: "Descripción", key: "descripcion_mercancia" },
      ]}
    />
  );
}
