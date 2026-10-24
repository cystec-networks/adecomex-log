import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PDFDocument } from "pdf-lib";
import { FileStack, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { OFICIO_RECTIFICACION } from "@/lib/oficios";
import { generarPaqueteExclusivo, reemplazarPaquete, PAQUETE_TIPO_DOCUMENTO } from "@/lib/paquete-rectificacion";

export { PAQUETE_TIPO_DOCUMENTO } from "@/lib/paquete-rectificacion";

/** Orden fijo del paquete. `tipos` = tipos de documento aceptados (el primero es el oficial). */
const ORDEN: { etiqueta: string; tipos: string[]; grupo?: string }[] = [
  { etiqueta: "Oficio de Rectificación Técnica", tipos: [OFICIO_RECTIFICACION.tipoDocumento] },
  { etiqueta: "Declaración Única Aduanera (DUA)", tipos: ["Declaración Única Aduanera (DUA)", "DUA"] },
  { etiqueta: "Reporte de Liquidación de Impuestos", tipos: ["Reporte de Liquidación de Impuestos"] },
  { etiqueta: "Conocimiento de embarque (BL)", tipos: ["Bill of Lading"] },
  { etiqueta: "Factura comercial", tipos: ["Factura comercial"] },
  { etiqueta: "Certificado de origen", tipos: ["Certificado de origen"] },
  // Sanitario y análisis se incluyen ambos si existen; basta con uno de los dos.
  { etiqueta: "Certificado Sanitario/Fitosanitario", tipos: ["Certificado Sanitario/Fitosanitario", "Certificado sanitario", "Certificado fitosanitario"], grupo: "sanitario-analisis" },
  { etiqueta: "Certificado de análisis", tipos: ["Certificado de análisis"], grupo: "sanitario-analisis" },
];

const esPdf = (p?: string | null) => !!p && p.toLowerCase().endsWith(".pdf");

export function PaqueteRectificacionButton({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [cargando, setCargando] = useState(false);

  const generar = async () => {
    setCargando(true);
    try {
      await generarPaqueteExclusivo(expedienteId, async () => {
      const [docsRes, permRes, expRes] = await Promise.all([
        supabase.from("documentos").select("tipo, storage_path, created_at").eq("expediente_id", expedienteId).order("created_at", { ascending: false }),
        supabase.from("permisos").select("tipo, documento_url, created_at").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false }),
        supabase.from("expedientes").select("numero").eq("id", expedienteId).maybeSingle(),
      ]);
      if (docsRes.error) throw docsRes.error;
      const docs = docsRes.data ?? [];
      const faltan: string[] = [];
      const rutas: string[] = [];
      const gruposFaltantes = new Map<string, string[]>();
      const gruposPresentes = new Set<string>();
      for (const item of ORDEN) {
        const d = item.tipos.map((t) => docs.find((x) => x.tipo === t && esPdf(x.storage_path))).find(Boolean);
        if (d?.storage_path) {
          rutas.push(d.storage_path);
          if (item.grupo) gruposPresentes.add(item.grupo);
        } else if (item.grupo) gruposFaltantes.set(item.grupo, [...(gruposFaltantes.get(item.grupo) ?? []), item.etiqueta]);
        else faltan.push(item.etiqueta);
      }
      for (const [grupo, etiquetas] of gruposFaltantes) {
        if (!gruposPresentes.has(grupo)) faltan.push(etiquetas.join(" o "));
      }
      const permisos = (permRes.data ?? []).filter((p) => esPdf(p.documento_url));
      const permiso =
        permisos.find((p) => p.tipo === "agricola") ?? permisos.find((p) => p.tipo === "fitosanitario") ?? permisos[0];
      if (permiso?.documento_url) rutas.push(permiso.documento_url);
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
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
      const nombre = `Paquete Rectificacion Tecnica ${expRes.data?.numero ?? ""} ${hoy}`.replace(/\s+/g, " ").trim();
      const path = `${expedienteId}/${Date.now()}_${nombre.replace(/\s+/g, "_")}.pdf`;
      const up = await supabase.storage.from("documentos").upload(path, blob, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const registro = {
        expediente_id: expedienteId,
        tipo: PAQUETE_TIPO_DOCUMENTO,
        storage_path: path,
        estado: "recibido" as const,
        fecha_recepcion: hoy,
        observaciones: `${PAQUETE_TIPO_DOCUMENTO} - ${hoy} (${rutas.length} documentos)`,
      };
      try {
        await reemplazarPaquete({
          listar: async () => {
            const { data, error } = await supabase.from("documentos").select("id, storage_path")
              .eq("expediente_id", expedienteId).eq("tipo", PAQUETE_TIPO_DOCUMENTO)
              .order("created_at", { ascending: false }).order("id");
            if (error) throw error;
            return data ?? [];
          },
          actualizar: async (id) => {
            const { error } = await supabase.from("documentos").update({ ...registro, file_hash: null })
              .eq("id", id).eq("expediente_id", expedienteId).eq("tipo", PAQUETE_TIPO_DOCUMENTO);
            if (error) throw error;
          },
          insertar: async () => {
            const { error } = await supabase.from("documentos").insert(registro);
            if (error) throw error;
          },
          eliminarDuplicados: async (ids) => {
            const { error } = await supabase.from("documentos").delete().in("id", ids)
              .eq("expediente_id", expedienteId).eq("tipo", PAQUETE_TIPO_DOCUMENTO);
            if (error) throw error;
          },
        });
      } catch (error) {
        // No retirar un archivo que ya pudiera haber quedado enlazado al actualizar.
        qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
        throw error;
      }
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${nombre}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success("Paquete generado y guardado en Documentos");
      });
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
