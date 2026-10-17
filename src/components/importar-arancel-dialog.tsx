import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { leerCsvArancel, type FilaArancel } from "@/lib/catalogo-arancelario";
import { importarArancel } from "@/lib/catalogo-arancelario.functions";
import { toast } from "sonner";

export function ImportarArancelDialog() {
  const [open, setOpen] = useState(false);
  const [filas, setFilas] = useState<FilaArancel[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importar = useServerFn(importarArancel);
  const qc = useQueryClient();
  const leer = async (file: File) => {
    setBusy(true); setError(""); setFilas([]); setNombre(file.name);
    try { setFilas(await leerCsvArancel(file)); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el archivo."); } finally { setBusy(false); }
  };
  const confirmar = async () => {
    setBusy(true); setError("");
    try {
      const resultado = await importar({ data: { filas } });
      await qc.invalidateQueries({ queryKey: ["catalogo-arancelario"] });
      toast.success(`${resultado.cantidad} partidas importadas o actualizadas.`); setOpen(false); setFilas([]); setNombre("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se importó el archivo."); } finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" onClick={() => { setError(""); setOpen(true); }}><Upload className="h-4 w-4 mr-2" />Importar catálogo arancelario</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Importar catálogo arancelario</DialogTitle><DialogDescription>CSV oficial preparado. Se actualizan las partidas por código; las tasas manuales de productos no se modifican.</DialogDescription></DialogHeader>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void leer(file); e.target.value = ""; }} />
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Seleccionar CSV</Button>
        {nombre && <div className="text-sm break-all">{nombre}</div>}
        {filas.length > 0 && <div className="text-sm space-y-1"><p className="font-medium">{filas.length} filas validadas</p><p className="text-muted-foreground">Primera: {filas[0]?.codigo} · Última: {filas[filas.length - 1]?.codigo}</p></div>}
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy || !filas.length} onClick={() => void confirmar()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar importación</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}