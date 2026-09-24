import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSignature, FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  OFICIO_RECTIFICACION,
  descargarWord,
  fetchOficioConfig,
  htmlAPdf,
  renderOficio,
  type DatosRectificacion,
} from "@/lib/oficios";

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

/** Genera el Oficio de Rectificación Técnica con vista previa editable. */
export function OficioRectificacionButton({ expedienteId, disabled }: { expedienteId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [numero, setNumero] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const generar = async () => {
    setCargando(true);
    try {
      const [expRes, itemsRes, docsRes, cfg] = await Promise.all([
        supabase.from("expedientes").select("*, clientes(nombre, rnc)").eq("id", expedienteId).maybeSingle(),
        supabase.from("mercancia_items").select("detalle_producto, descripcion, pais_origen").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no"),
        supabase.from("documentos").select("tipo, estado").eq("expediente_id", expedienteId),
        fetchOficioConfig(),
      ]);
      if (expRes.error) throw expRes.error;
      const e: any = expRes.data ?? {};
      const items: any[] = itemsRes.data ?? [];
      if (!(e.producto_correcto_rectificacion ?? "").trim()) {
        toast.warning("Complete y guarde el campo \"Producto correcto\" antes de generar el oficio.");
      }
      const datos: DatosRectificacion = {
        productoCorrecto: e.producto_correcto_rectificacion ?? "",
        consignatario: e.clientes?.nombre ?? "",
        rnc: e.clientes?.rnc ?? "",
        productoDeclarado: uniq(items.map((i) => i.detalle_producto || i.descripcion)).join("; ") || (e.descripcion_mercancia ?? ""),
        peso: e.peso_neto != null ? Number(e.peso_neto).toLocaleString("es-DO") : "",
        pais: uniq(items.map((i) => i.pais_origen)).join(", ") || (e.pais_origen ?? ""),
        puerto: e.puerto_arribo ?? "",
        dua: e.numero_dua ?? "",
        permiso: e.numero_vuce ?? "",
        tramite: e.numero_tramite_rectificacion ?? "",
        anexos: uniq(
          (docsRes.data ?? [])
            .filter((d: any) => ["recibido", "aprobado", "observado"].includes(d.estado) && d.tipo !== OFICIO_RECTIFICACION.tipoDocumento)
            .map((d: any) => d.tipo),
        ),
      };
      setNumero(e.numero ?? "");
      setHtml(renderOficio(OFICIO_RECTIFICACION, datos, cfg));
      setOpen(true);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo generar el oficio");
    } finally {
      setCargando(false);
    }
  };

  const nombre = `Oficio Rectificacion Tecnica ${numero}`.trim();

  const pdf = async () => {
    if (!ref.current) throw new Error("Vista previa no disponible");
    return htmlAPdf(ref.current);
  };

  const guardarYDescargar = async (formato: "pdf" | "word") => {
    setGuardando(true);
    try {
      const doc = await pdf();
      const blob: Blob = doc.output("blob");
      const path = `${expedienteId}/${Date.now()}_${nombre.replace(/\s+/g, "_")}.pdf`;
      const up = await supabase.storage.from("documentos").upload(path, blob, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const ins = await supabase.from("documentos").insert({
        expediente_id: expedienteId,
        tipo: OFICIO_RECTIFICACION.tipoDocumento,
        storage_path: path,
        estado: "recibido",
        fecha_recepcion: new Date().toISOString().slice(0, 10),
        observaciones: "Generado automáticamente desde el Expediente",
      });
      if (ins.error) throw ins.error;
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      if (formato === "pdf") doc.save(`${nombre}.pdf`);
      else descargarWord(ref.current?.innerHTML ?? html, nombre);
      toast.success("Oficio guardado en Documentos del expediente");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo guardar el oficio");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={generar} disabled={disabled || cargando}>
        {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSignature className="h-4 w-4 mr-1" />}
        Generar Oficio de Rectificación Técnica
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa editable — Oficio de Rectificación Técnica</DialogTitle>
            <p className="text-xs text-muted-foreground">Puede hacer clic en el texto para ajustar la redacción antes de descargar.</p>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30 p-4">
            {open && (
              <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                className="mx-auto bg-background shadow-sm outline-none"
                style={{ width: "8.5in", padding: "0.6in", background: "#fff" }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={guardando} onClick={() => guardarYDescargar("word")}>
                <Save className="h-4 w-4 mr-1" /> Guardar y descargar Word
              </Button>
              <Button size="sm" disabled={guardando} onClick={() => guardarYDescargar("pdf")}>
                {guardando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                Guardar y descargar PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default OficioRectificacionButton;
