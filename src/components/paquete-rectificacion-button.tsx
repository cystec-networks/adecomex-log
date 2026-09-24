import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PDFDocument } from "pdf-lib";
import { FileStack, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { OFICIO_RECTIFICACION } from "@/lib/oficios";

export const PAQUETE_TIPO_DOCUMENTO = "Paquete Rectificación Técnica";

/** Orden fijo del paquete. `tipos` = tipos de documento aceptados (el primero es el oficial). */
const ORDEN: { etiqueta: string; tipos: string[] }[] = [
  { etiqueta: "Oficio de Rectificación Técnica", tipos: [OFICIO_RECTIFICACION.tipoDocumento] },
  { etiqueta: "Declaración Única Aduanera (DUA)", tipos: ["Declaración Única Aduanera (DUA)", "DUA"] },
  { etiqueta: "Reporte de Liquidación de Impuestos", tipos: ["Reporte de Liquidación de Impuestos"] },
  { etiqueta: "Conocimiento de embarque (BL)", tipos: ["Bill of Lading"] },
  { etiqueta: "Factura comercial", tipos: ["Factura comercial"] },
  { etiqueta: "Certificado de origen", tipos: ["Certificado de origen"] },
  { etiqueta: "Certificado Sanitario/Análisis", tipos: ["Certificado sanitario", "Certificado de análisis", "Certificado fitosanitario"] },
];

const esPdf = (p?: string | null) => !!p && p.toLowerCase().endsWith(".pdf");

export function PaqueteRectificacionButton({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [cargando, setCargando] = useState(false);

  const generar = async () => {
    setCargando(true);
    try {
      const [docsRes, permRes, expRes] = await Promise.all([
        supabase.from("documentos").select("tipo, storage_path, created_at").eq("expediente_id", expedienteId).order("created_at", { ascending: false }),
        supabase.from("permisos").select("tipo, documento_url, created_at").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false }),
        supabase.from("expedientes").select("numero").eq("id", expedienteId).maybeSingle(),
      ]);
      if (docsRes.error) throw docsRes.error;
      const docs = docsRes.data ?? [];
      const faltan: string[] = [];
      const rutas: string[] = [];
      for (const item of ORDEN) {
        const d = item.tipos.map((t) => docs.find((x) => x.tipo === t && esPdf(x.storage_path))).find(Boolean);
        if (d) rutas.push(d.storage_path!);
        else faltan.push(item.etiqueta);
      }
      const permisos = (permRes.data ?? []).filter((p) => esPdf(p.documento_url));
      const permiso =
        permisos.find((p) => p.tipo === "agricola") ?? permisos.find((p) => p.tipo === "fitosanitario") ?? permisos[0];
      if (permiso) rutas.push(permiso.documento_url!);
      else faltan.push("Permiso VUCE de Agricultura (módulo Permisos)");

      if (faltan.length) {
        toast.error(`Faltan documentos en PDF: ${faltan.join(", ")}.`, { duration: 10000 });
        return;
      }

      const final = await PDFDocument.create();
      for (const ruta of rutas) {
        const { data, error } = await supabase.storage.from("documentos").download(ruta);
        if (error || !data) throw new Error(`No se pudo descargar ${ruta.split("/").pop()}`);
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true });
        } catch {
          throw new Error(`El archivo ${ruta.split("/").pop()} no es un PDF válido`);
        }
        const pages = await final.copyPages(src, src.getPageIndices());
        pages.forEach((p) => final.addPage(p));
      }
      const bytes = await final.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const hoy = new Date().toLocaleDateString("en-CA");
      const nombre = `Paquete Rectificacion Tecnica ${expRes.data?.numero ?? ""} ${hoy}`.replace(/\s+/g, " ").trim();
      const path = `${expedienteId}/${Date.now()}_${nombre.replace(/\s+/g, "_")}.pdf`;
      const up = await supabase.storage.from("documentos").upload(path, blob, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const ins = await supabase.from("documentos").insert({
        expediente_id: expedienteId,
        tipo: PAQUETE_TIPO_DOCUMENTO,
        storage_path: path,
        estado: "recibido",
        fecha_recepcion: hoy,
        observaciones: `${PAQUETE_TIPO_DOCUMENTO} - ${hoy} (${rutas.length} documentos)`,
      });
      if (ins.error) throw ins.error;
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${nombre}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success("Paquete generado y guardado en Documentos");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo generar el paquete");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={generar} disabled={cargando}>
      {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileStack className="h-4 w-4 mr-1" />}
      Generar Paquete Completo (PDF)
    </Button>
  );
}
