import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchDatosBancariosReembolso } from "@/lib/reembolso-config";
import { buildSolicitudReembolsoPdf } from "@/lib/pdf-solicitud-reembolso";

/** Genera la Solicitud de Reembolso de Gastos de un Expediente a partir de los
 *  gastos operativos marcados como "Es reembolso". */
export function SolicitudReembolsoPdfButton({ exp }: { exp: any }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef("Solicitud de Reembolso.pdf");

  const { data: totalReembolsos } = useQuery({
    queryKey: ["gastos-reembolso-count", exp?.id],
    enabled: Boolean(exp?.id),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("gastos")
        .select("id", { count: "exact", head: true })
        .eq("expediente_id", exp.id)
        .eq("es_reembolso", true)
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const sinReembolsos = totalReembolsos === 0;

  const cerrar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generar = async () => {
    setGenerando(true);
    try {
      const [gastosRes, expRes, banco] = await Promise.all([
        supabase
          .from("gastos")
          .select("concepto, monto, es_reembolso")
          .eq("expediente_id", exp.id)
          .eq("es_reembolso", true)
          .is("deleted_at", null)
          .order("fecha", { ascending: true }),
        supabase
          .from("expedientes")
          .select("numero, bl_awb, descripcion_mercancia, clientes(nombre, rnc, direccion)")
          .eq("id", exp.id)
          .maybeSingle(),
        fetchDatosBancariosReembolso(),
      ]);
      if (gastosRes.error) throw gastosRes.error;
      if (expRes.error) throw expRes.error;

      const lineas = (gastosRes.data ?? []).map((g: any) => ({
        descripcion: g.concepto ?? "—",
        cantidad: 1,
        precio: Number(g.monto) || 0,
      }));
      if (lineas.length === 0) {
        toast.error(
          "Este expediente no tiene gastos operativos marcados como \"Es reembolso\". Marque los gastos a reembolsar antes de generar el documento.",
        );
        return;
      }
      if (!banco.cuenta && !banco.banco && !banco.beneficiario) {
        toast.warning(
          "Faltan los datos bancarios de la empresa. Configúrelos en Administración → Configuración del sistema.",
        );
      }

      const expData: any = expRes.data ?? {};
      const numeroExp = expData.numero ?? exp.numero ?? "";
      const doc = await buildSolicitudReembolsoPdf({
        numeroDocumento: `REEBGVEXP-${numeroExp || "SIN NUMERO"}`,
        fecha: new Date().toLocaleDateString("es-DO"),
        cliente: {
          nombre: expData.clientes?.nombre ?? "—",
          direccion: expData.clientes?.direccion ?? "",
          rnc: expData.clientes?.rnc ?? "",
        },
        condicion: "De contado",
        concepto: "Gastos operativos.",
        mercancia: expData.descripcion_mercancia ?? "—",
        blGuia: expData.bl_awb ?? "—",
        lineas,
        datosBancarios: banco,
      });

      fileNameRef.current = `REEBGVEXP-${numeroExp || "SIN NUMERO"}.pdf`;
      doc.setProperties({ title: fileNameRef.current.replace(/\.pdf$/, "") });
      docRef.current = doc;
      if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
      setPreviewUrl(`${doc.output("bloburl").toString()}#toolbar=0`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo generar la Solicitud de Reembolso",
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={generando} onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        {generando ? "Generando…" : "Generar Solicitud de Reembolso"}
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Solicitud de Reembolso de Gastos</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && (
              <iframe src={previewUrl} title="Solicitud de Reembolso" className="w-full h-full border-0" />
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrar}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SolicitudReembolsoPdfButton;
