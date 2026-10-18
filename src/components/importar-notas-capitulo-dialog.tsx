import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { leerCsvNotasCapitulo, type NotaCapitulo } from "@/lib/capitulo-notas";
import { importarNotasCapitulo } from "@/lib/capitulo-notas.functions";
import { toast } from "sonner";

export function ImportarNotasCapituloDialog() {
  const [open, setOpen] = useState(false);
  const [filas, setFilas] = useState<NotaCapitulo[]>([]);
  const [errores, setErrores] = useState<{ fila: number; mensaje: string }[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importar = useServerFn(importarNotasCapitulo);
  const qc = useQueryClient();
  const leer = async (file: File) => {
    setBusy(true); setError(""); setFilas([]); setErrores([]); setNombre(file.name);
    try {
      const resultado = await leerCsvNotasCapitulo(file);
      setFilas(resultado.filas); setErrores(resultado.errores);
      if (!resultado.filas.length) setError("Ninguna fila del archivo es válida. Revisa los errores reportados.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el archivo."); }
    finally { setBusy(false); }
  };
  const confirmar = async () => {
    setBusy(true); setError("");
    try {
      const resultado = await importar({ data: { filas } });
      await qc.invalidateQueries({ queryKey: ["capitulo-notas"] });
      toast.success(`${resultado.insertadas} capítulos nuevos y ${resultado.actualizadas} actualizados.${errores.length ? ` ${errores.length} filas con error se omitieron.` : ""}`);
      setOpen(false); setFilas([]); setErrores([]); setNombre("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se importaron las notas."); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" onClick={() => { setError(""); setOpen(true); }}><Upload className="h-4 w-4 mr-2" />Importar notas por capítulo</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Importar notas por capítulo</DialogTitle><DialogDescription>CSV con columnas capitulo y notas_texto. Se actualiza por capítulo; las filas con error se omiten y se reportan. El capítulo 77 está reservado.</DialogDescription></DialogHeader>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void leer(file); e.target.value = ""; }} />
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Seleccionar CSV</Button>
        {nombre && <p className="text-sm break-all">{nombre}</p>}
        {filas.length > 0 && <p className="text-sm font-medium">{filas.length} filas válidas</p>}
        {errores.length > 0 && <div className="text-sm space-y-1"><p className="font-medium text-destructive">{errores.length} filas con error (se omitirán)</p><ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground">{errores.map((e) => <li key={e.fila}>Fila {e.fila}: {e.mensaje}</li>)}</ul></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy || !filas.length} onClick={() => void confirmar()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar importación</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}