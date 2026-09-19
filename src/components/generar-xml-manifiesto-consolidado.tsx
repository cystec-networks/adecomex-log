import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { buildImportConsolidatedMasterXml, downloadXml, loadBrokerConfig, validarManifiestoConsolidado } from "@/lib/siga-xml";

type Props = {
  operacionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

/** Vista previa y descarga del XML de Manifiesto Consolidado de Importación (SIGA). */
export function ManifiestoConsolidadoXmlDialog({ operacionId, open, onOpenChange }: Props) {
  const broker = useMemo(() => loadBrokerConfig(), []);
  const [excluidas, setExcluidas] = useState<string[]>([]);

  const { data: base } = useQuery({
    queryKey: ["manifiesto-cons-operacion", operacionId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("operaciones_logistica").select("*").eq("id", operacionId).maybeSingle()).data,
  });

  // Todas las operaciones que comparten el mismo BL Madre forman un consolidado.
  const { data: operaciones = [] } = useQuery({
    queryKey: ["manifiesto-cons-grupo", (base as any)?.id, (base as any)?.bl_awb],
    enabled: open && !!base,
    queryFn: async () => {
      const b = base as any;
      let q = supabase.from("operaciones_logistica").select("*").is("eliminado_en", null).order("numero");
      q = b?.bl_awb ? q.eq("bl_awb", b.bl_awb) : q.eq("id", b.id);
      const { data } = await q;
      const rows = (data ?? []) as any[];
      return rows.some((r) => r.id === b.id) ? rows : [b, ...rows];
    },
  });

  const seleccionadas = useMemo(
    () => (operaciones as any[]).filter((o: any) => o && !excluidas.includes(o.id)),
    [operaciones, excluidas],
  );

  const { data: contenedores = [] } = useQuery({
    queryKey: ["manifiesto-cons-contenedores", seleccionadas.map((o: any) => o.id).join(",")],
    enabled: open && seleccionadas.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("logistica_contenedores")
        .select("*")
        .in("operacion_logistica_id", seleccionadas.map((o: any) => o.id))
        .order("item_no");
      return data ?? [];
    },
  });

  const issues = useMemo(
    () => (seleccionadas.length ? validarManifiestoConsolidado(seleccionadas) : []),
    [seleccionadas],
  );
  const xml = useMemo(
    () => (seleccionadas.length ? buildImportConsolidatedMasterXml(seleccionadas, contenedores as any[], broker) : ""),
    [seleccionadas, contenedores, broker],
  );

  const descargar = () => {
    if (!xml) return;
    const head: any = seleccionadas[0] ?? {};
    const nombre = `MANIFIESTO_CONSOLIDADO_${head.manifiesto_no || head.bl_awb || head.numero || "SIGA"}.xml`;
    downloadXml(nombre.replace(/[^\w.\-]+/g, "_"), xml);
    if (issues.length) toast.warning(`XML descargado con ${issues.length} campo(s) SIGA incompleto(s)`);
    else toast.success("XML de manifiesto consolidado descargado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5" /> XML SIGA · Manifiesto Consolidado
          </DialogTitle>
          <DialogDescription>
            BL Madre del consolidador con los BL Hijos emitidos. Incluye las operaciones con el mismo BL Madre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {(operaciones as any[]).length > 1 && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">BL Hijos incluidos en el consolidado</Label>
              {(operaciones as any[]).map((o: any) => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!excluidas.includes(o.id)}
                    onCheckedChange={(c) =>
                      setExcluidas((prev) => (c ? prev.filter((x) => x !== o.id) : [...prev, o.id]))
                    }
                  />
                  <span>{o.numero} · {o.bl_hijo_numero || "sin BL Hijo"} · {o.producto ?? ""}</span>
                </div>
              ))}
            </div>
          )}

          {issues.length > 0 ? (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-700" />
              <AlertTitle>Faltan {issues.length} dato(s) exigido(s) por SIGA</AlertTitle>
              <AlertDescription>
                Puedes descargar igual; esas etiquetas saldrán vacías.
                <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                  {issues.map((i) => <li key={i.field}>{i.label}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-green-500/40 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Validación correcta</AlertTitle>
              <AlertDescription>Todos los campos obligatorios del consolidado están completos.</AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Vista previa XML</Label>
            <pre className="mt-1 p-3 rounded-md border bg-muted/40 text-xs overflow-auto max-h-[45vh] font-mono">
              {xml || "—"}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={descargar} disabled={!xml}>
            <Download className="h-4 w-4 mr-1" /> Descargar XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
