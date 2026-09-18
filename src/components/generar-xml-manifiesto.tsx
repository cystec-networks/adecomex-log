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
import { buildImportManifestXml, downloadXml, loadBrokerConfig, validarManifiesto } from "@/lib/siga-xml";

type Props = {
  operacionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

/** Vista previa y descarga del XML de Manifiesto de Importación (SIGA). */
export function ManifiestoXmlDialog({ operacionId, open, onOpenChange }: Props) {
  const broker = useMemo(() => loadBrokerConfig(), []);
  const [excluidas, setExcluidas] = useState<string[]>([]);

  const { data: base } = useQuery({
    queryKey: ["manifiesto-operacion", operacionId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("operaciones_logistica").select("*").eq("id", operacionId).maybeSingle()).data,
  });

  // Todas las operaciones que comparten buque + viaje forman un mismo manifiesto.
  const { data: operaciones = [] } = useQuery({
    queryKey: ["manifiesto-grupo", base?.id, base?.buque, base?.voyage],
    enabled: open && !!base,
    queryFn: async () => {
      let q = supabase
        .from("operaciones_logistica")
        .select("*")
        .is("eliminado_en", null)
        .order("numero");
      if (base?.buque) q = q.eq("buque", base.buque);
      else q = q.eq("id", base!.id);
      if (base?.voyage) q = q.eq("voyage", base.voyage);
      const { data } = await q;
      const rows = data ?? [];
      return rows.some((r: any) => r.id === base!.id) ? rows : [base, ...rows];
    },
  });

  const seleccionadas = useMemo(
    () => (operaciones as any[]).filter((o: any) => o && !excluidas.includes(o.id)),
    [operaciones, excluidas],
  );

  const { data: contenedores = [] } = useQuery({
    queryKey: ["manifiesto-contenedores", seleccionadas.map((o: any) => o.id).join(",")],
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

  const issues = useMemo(() => (seleccionadas.length ? validarManifiesto(seleccionadas) : []), [seleccionadas]);
  const xml = useMemo(
    () => (seleccionadas.length ? buildImportManifestXml(seleccionadas, contenedores as any[], broker) : ""),
    [seleccionadas, contenedores, broker],
  );

  const descargar = () => {
    if (!xml) return;
    const head: any = seleccionadas[0] ?? {};
    downloadXml(`MANIFIESTO_${head.buque || head.numero || "SIGA"}_${head.voyage || ""}.xml`.replace(/_+\.xml$/, ".xml"), xml);
    if (issues.length) toast.warning(`XML descargado con ${issues.length} campo(s) SIGA incompleto(s)`);
    else toast.success("XML de manifiesto descargado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5" /> XML SIGA · Manifiesto de Importación
          </DialogTitle>
          <DialogDescription>
            Documento de carga del buque/vuelo. Incluye todas las operaciones con el mismo buque y viaje.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {(operaciones as any[]).length > 1 && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Operaciones incluidas en el manifiesto</Label>
              {(operaciones as any[]).map((o: any) => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!excluidas.includes(o.id)}
                    onCheckedChange={(c) =>
                      setExcluidas((prev) => (c ? prev.filter((x) => x !== o.id) : [...prev, o.id]))
                    }
                  />
                  <span>{o.numero} · {o.bl_hijo_numero || o.bl_awb || "sin BL"} · {o.producto ?? ""}</span>
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
              <AlertDescription>Todos los campos obligatorios del manifiesto están completos.</AlertDescription>
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
