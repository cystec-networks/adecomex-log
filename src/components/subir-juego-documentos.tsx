import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PDFDocument } from "@cantoo/pdf-lib";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { clasificarPaginaJuego, leerEncabezadosJuego } from "@/lib/juego-documentos.functions";
import { separarArchivoJuego, guardarGrupoJuego, gruposJuego, type ArchivoJuego } from "@/lib/juego-documentos";
import { hoyRDISO } from "@/lib/dates";

export function SubirJuegoDocumentos({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const clasificar = useServerFn(clasificarPaginaJuego);
  const encabezados = useServerFn(leerEncabezadosJuego);
  const qc = useQueryClient();
  const agregar = (nuevos: File[]) => setFiles((prev) => [...prev, ...nuevos.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size && p.lastModified === f.lastModified))]);
  const subir = async () => {
    if (busy || !files.length) return;
    setBusy(true); setResults([]);
    const leidos: ArchivoJuego[] = [];
    const mensajes: string[] = [];
    const carpeta = `${expedienteId}/juegos/${crypto.randomUUID()}`;
    try {
      for (const file of files) {
        setProgress(`Guardando ${file.name}…`);
        let originalId: string | undefined;
        let path = "";
        try {
          path = `${carpeta}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]/g, "_")}`;
          const { error } = await supabase.storage.from("documentos").upload(path, file);
          if (error) throw error;
          // Durable fallback before recognition: an interruption cannot discard a file.
          const { data, error: rowError } = await supabase.from("documentos").insert({ expediente_id: expedienteId, tipo: "Otro", estado: "recibido", fecha_recepcion: hoyRDISO(), storage_path: path, observaciones: `Juego de documentos — original: ${file.name}`.slice(0, 500) }).select("id").single();
          if (rowError || !data) { await supabase.storage.from("documentos").remove([path]); throw rowError ?? new Error("No se pudo guardar el original"); }
          originalId = data.id;
          let bytes = new Uint8Array(await file.arrayBuffer());
          let textos: string[] = [];
          if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
            try { textos = (await encabezados({ data: { expedienteId, storagePath: path } })).textos; } catch { /* scanned PDFs use the page classifier */ }
          } else if (/^image\/(png|jpeg)$/.test(file.type)) {
            bytes = new Uint8Array(await (await import("@/lib/correo-adjuntos-union")).unirArchivosPdf([{ bytes, mime: file.type }]));
          } else if (file.type.startsWith("image/")) {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo leer la imagen");
            ctx.drawImage(bitmap, 0, 0); bitmap.close();
            const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Imagen no válida")), "image/png"));
            bytes = new Uint8Array(await (await import("@/lib/correo-adjuntos-union")).unirArchivosPdf([{ bytes: new Uint8Array(await png.arrayBuffer()), mime: "image/png" }]));
          } else { mensajes.push(`${file.name}: recibido en Otros documentos`); continue; }
          const paginas = (await PDFDocument.load(bytes, { password: "" } as any)).getPageCount();
          const segmentos = await separarArchivoJuego(file.name.replace(/\.[^.]+$/, ".pdf"), bytes, textos, async (nombre, base64) => (await clasificar({ data: { expedienteId, nombre, base64 } })).tipo, setProgress);
          for (const s of segmentos) leidos.push({ ...s, storage_path: path, ...(segmentos.length === 1 && paginas > 0 ? { originalId } : {}) });
          if (segmentos.length > 1) mensajes.push(`${file.name}: ${segmentos.length} documentos separados; original en Otros documentos`);
        } catch (e) { mensajes.push(`${file.name}: ${originalId ? "original recibido en Otros documentos; " : "no se pudo guardar; "}${e instanceof Error ? e.message : "error de lectura"}`); }
        await qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      }
      for (const grupo of gruposJuego(leidos)) {
        setProgress(`Guardando ${grupo[0]?.tipo}…`);
        try { await guardarGrupoJuego(expedienteId, grupo); mensajes.push(`${grupo[0]?.tipo}: recibido${grupo.length > 1 ? ` (${grupo.length} documentos unidos)` : ""}`); }
        catch (e) { mensajes.push(`${grupo[0]?.tipo}: no se pudo distribuir; originales en Otros documentos. ${e instanceof Error ? e.message : "Error"}`); }
      }
      setResults(mensajes); setFiles([]);
      toast.success("Carga finalizada; revisa el resultado de cada archivo");
    } finally { setBusy(false); setProgress(""); await qc.invalidateQueries({ queryKey: ["documentos", expedienteId] }); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload className="mr-1 h-4 w-4" />Subir juego de documentos</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>Subir juego de documentos</DialogTitle></DialogHeader>
        <input ref={input} type="file" multiple className="hidden" aria-label="Archivos del juego de documentos" onChange={(e) => { agregar(Array.from(e.target.files ?? [])); e.target.value = ""; }} disabled={busy} />
        <div className="border border-dashed border-border rounded-md p-6 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) agregar(Array.from(e.dataTransfer.files)); }}>
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" />Seleccionar archivos</Button>
          <p className="mt-2 text-sm text-muted-foreground">o arrastrar archivos aquí</p>
        </div>
        <ul className="max-h-64 overflow-y-auto space-y-2 text-sm">
          {files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-2"><span className="min-w-0 flex-1 break-words">{f.name}</span><Button variant="ghost" size="icon" aria-label={`Quitar ${f.name}`} disabled={busy} onClick={() => setFiles((prev) => prev.filter((_, n) => n !== i))}><X className="h-4 w-4" /></Button></li>)}
        </ul>
        {busy && <p role="status" className="flex items-center gap-2 text-sm break-words"><Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />{progress}</p>}
        {!!results.length && <ul aria-label="Resultado de carga" className="max-h-72 overflow-y-auto space-y-2 text-sm">{results.map((r, i) => <li key={i} className="break-words">{r}</li>)}</ul>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cerrar</Button><Button onClick={subir} disabled={busy || !files.length}>{busy ? "Procesando…" : `Subir${files.length ? ` (${files.length})` : ""}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}