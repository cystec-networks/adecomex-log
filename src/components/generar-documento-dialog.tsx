import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, FileSignature } from "lucide-react";
import { resolverPlantilla } from "@/lib/plantillas-campos";

const CHECKLIST_MAP: Record<string, string> = {
  "factura comercial": "Factura comercial",
  "lista de empaque": "Lista de empaque",
  "certificado de origen": "Certificado de origen",
};

/** Normaliza el nombre de la plantilla para compararlo con el checklist. */
function tipoChecklist(nombre: string): string | null {
  const base = nombre
    .toLowerCase()
    .replace(/\(no preferencial\)/g, "")
    .replace(/dr-?cafta/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return CHECKLIST_MAP[base] ?? null;
}

export function GenerarDocumentoButton({ exp }: { exp: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [plantillaId, setPlantillaId] = useState<string>("");
  const [html, setHtml] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [preguntaTipo, setPreguntaTipo] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const { data: plantillas } = useQuery({
    queryKey: ["plantillas-activas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("plantillas_documentos")
        .select("id, nombre, contenido_html")
        .eq("activo", true)
        .order("nombre");
      return data ?? [];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["plantilla-mercancia", exp?.id],
    enabled: open && !!exp?.id,
    queryFn: async () =>
      (await supabase
        .from("mercancia_items")
        .select("*")
        .eq("expediente_id", exp.id)
        .is("deleted_at", null)
        .order("item_no")).data ?? [],
  });

  // Exportador y Productor desde el catálogo de terceros extranjeros (por TID)
  const tidExportador = (exp?.suplidor_rnc ?? "").trim();
  const tidProductor = ((exp?.certificado_productor_rnc || exp?.suplidor_rnc) ?? "").trim();

  const { data: terceros } = useQuery({
    queryKey: ["plantilla-terceros", tidExportador, tidProductor],
    enabled: open && (!!tidExportador || !!tidProductor),
    staleTime: 0,
    queryFn: async () => {
      const tids = [...new Set([tidExportador, tidProductor].filter(Boolean))];
      if (!tids.length) return {};
      const { data } = await supabase
        .from("catalogo_terceros_extranjeros")
        .select("nombre, tid, direccion, telefono, email, pais_nombre")
        .in("tid", tids);
      const byTid = new Map((data ?? []).map((t: any) => [String(t.tid).trim(), t]));
      const mapear = (t: any) =>
        t ? { nombre: t.nombre, tid: t.tid, direccion: t.direccion, telefono: t.telefono, email: t.email, pais: t.pais_nombre } : null;
      return {
        exportador: mapear(byTid.get(tidExportador)),
        productor: mapear(byTid.get(tidProductor)),
      };
    },
  });

  // Documento previamente guardado para este expediente + plantilla
  const { data: guardado, isFetching: cargandoGuardado } = useQuery({
    queryKey: ["documento-generado", exp?.id, plantillaId],
    enabled: open && !!exp?.id && !!plantillaId,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("documentos_generados")
        .select("id, html_resuelto")
        .eq("expediente_id", exp.id)
        .eq("plantilla_id", plantillaId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const plantilla = plantillas?.find((p: any) => p.id === plantillaId);

  useEffect(() => {
    if (!plantilla) { setHtml(""); return; }
    if (cargandoGuardado) return;
    if (guardado?.html_resuelto) { setHtml(guardado.html_resuelto); return; }
    setHtml(resolverPlantilla(plantilla.contenido_html ?? "", exp, items ?? [], terceros ?? {}));
  }, [plantillaId, items, plantilla, exp, terceros, guardado, cargandoGuardado]);

  useEffect(() => {
    if (!open) { setPlantillaId(""); setHtml(""); }
  }, [open]);

  const guardar = async () => {
    if (!plantillaId) return;
    const contenido = previewRef.current?.innerHTML ?? html;
    setGuardando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("documentos_generados")
        .upsert(
          {
            expediente_id: exp.id,
            plantilla_id: plantillaId,
            html_resuelto: contenido,
            creado_por: userData?.user?.id ?? null,
          },
          { onConflict: "expediente_id,plantilla_id" },
        );
      if (error) throw error;
      toast.success("Documento guardado");
      qc.invalidateQueries({ queryKey: ["documento-generado", exp.id, plantillaId] });
    } catch (e: any) {
      console.error("[GenerarDocumento] guardar", e);
      toast.error(e?.message ?? "No se pudo guardar el documento");
    } finally {
      setGuardando(false);
    }
  };


  const descargar = async () => {
    if (!previewRef.current || !plantilla) return;
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const fallbackMargin = 10;

      const paginas = Array.from(
        previewRef.current.querySelectorAll<HTMLElement>(".doc-page"),
      );
      const targets = paginas.length ? paginas : [previewRef.current];

      for (let i = 0; i < targets.length; i++) {
        const canvas = await html2canvas(targets[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();

        if (paginas.length) {
          // El formulario de referencia usa márgenes laterales más amplios que
          // las plantillas genéricas. Cada bloque ocupa una hoja carta completa.
          const marginX = 20;
          const marginY = 14;
          const maxW = pageWidth - marginX * 2;
          const maxH = pageHeight - marginY * 2;
          const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
          const w = canvas.width * ratio;
          const h = canvas.height * ratio;
          pdf.addImage(imgData, "PNG", marginX + (maxW - w) / 2, marginY, w, h);
        } else {
          // Plantilla sin marcas de página: se corta en varias páginas
          const maxW = pageWidth - fallbackMargin * 2;
          const maxH = pageHeight - fallbackMargin * 2;
          const imgWidth = maxW;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          let heightLeft = imgHeight;
          let position = fallbackMargin;
          pdf.addImage(imgData, "PNG", fallbackMargin, position, imgWidth, imgHeight);
          heightLeft -= maxH;
          while (heightLeft > 0) {
            position = heightLeft - imgHeight + fallbackMargin;
            pdf.addPage();
            pdf.addImage(imgData, "PNG", fallbackMargin, position, imgWidth, imgHeight);
            heightLeft -= maxH;
          }
        }
      }
      pdf.save(`${plantilla.nombre}_${exp.numero ?? "documento"}.pdf`);
      const tipo = tipoChecklist(plantilla.nombre);
      if (tipo) setPreguntaTipo(tipo);
    } catch (e: any) {
      console.error("[GenerarDocumento] descargar PDF", e);
      const detalle = e?.message || e?.toString?.() || "error desconocido";
      toast.error(`No se pudo generar el PDF: ${detalle}`);
    }

  };

  const marcarChecklist = async () => {
    if (!preguntaTipo) return;
    const hoy = new Date().toLocaleDateString("en-CA");
    try {
      const { data: existente } = await supabase
        .from("documentos")
        .select("id, fecha_recepcion")
        .eq("expediente_id", exp.id)
        .eq("tipo", preguntaTipo)
        .limit(1)
        .maybeSingle();

      if (existente) {
        const { error } = await supabase
          .from("documentos")
          .update({ estado: "recibido", fecha_recepcion: existente.fecha_recepcion ?? hoy })
          .eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("documentos").insert({
          expediente_id: exp.id,
          tipo: preguntaTipo,
          estado: "recibido",
          fecha_recepcion: hoy,
          storage_path: null,
        });
        if (error) throw error;
      }
      toast.success("Documento marcado como recibido");
      qc.invalidateQueries({ queryKey: ["documentos", exp.id] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo actualizar el checklist");
    } finally {
      setPreguntaTipo(null);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSignature className="h-4 w-4 mr-1" /> Generar Documento
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Generar documento desde plantilla</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-3 border-b flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5 min-w-[280px]">
              <Label className="text-xs">Plantilla</Label>
              <Select value={plantillaId} onValueChange={setPlantillaId}>
                <SelectTrigger className="w-[320px]"><SelectValue placeholder="Selecciona una plantilla" /></SelectTrigger>
                <SelectContent>
                  {(plantillas ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground flex-1 min-w-[220px]">
              Puedes editar el documento directamente en la vista previa antes de descargarlo.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 p-6">
            {!plantillaId ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                Selecciona una plantilla para ver la vista previa.
              </div>
            ) : (
              <div
                ref={previewRef}
                contentEditable
                suppressContentEditableWarning
                className="bg-background mx-auto max-w-[8.5in] min-h-[11in] p-10 shadow-sm rounded-sm prose prose-sm max-w-none focus:outline-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-400 [&_td]:p-1 [&_th]:border [&_th]:border-neutral-400 [&_th]:p-1"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button size="sm" onClick={descargar} disabled={!plantillaId}>
              <Download className="h-4 w-4 mr-1" /> Descargar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!preguntaTipo} onOpenChange={(o) => !o && setPreguntaTipo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actualizar checklist</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Marcar "{preguntaTipo}" como recibido en el Checklist de Documentos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={marcarChecklist}>Sí, marcar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default GenerarDocumentoButton;
