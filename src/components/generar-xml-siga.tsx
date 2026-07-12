import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileCode2, AlertTriangle, Download, Settings2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  buildImportDUAXml,
  downloadXml,
  loadBrokerConfig,
  saveBrokerConfig,
  validateExpediente,
  type BrokerConfig,
} from "@/lib/siga-xml";

export function GenerarXmlSigaButton({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [broker, setBroker] = useState<BrokerConfig>(() => loadBrokerConfig());

  const { data: exp } = useQuery({
    queryKey: ["expediente-xml", expedienteId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("expedientes").select("*, clientes(*)").eq("id", expedienteId).maybeSingle()).data,
  });

  const { data: items } = useQuery({
    queryKey: ["expediente-xml-items", expedienteId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const issues = useMemo(() => (exp ? validateExpediente(exp, items ?? [], broker) : []), [exp, items, broker]);
  const xml = useMemo(() => (exp ? buildImportDUAXml(exp, items ?? [], broker) : ""), [exp, items, broker]);
  const valid = issues.length === 0;

  const handleDownload = () => {
    if (!valid) return toast.error("Corrige los errores antes de descargar");
    downloadXml(`SIGA_${exp.numero}.xml`, xml);
    toast.success("XML descargado");
  };

  const handleSaveCfg = () => {
    saveBrokerConfig(broker);
    setCfgOpen(false);
    toast.success("Configuración de agencia guardada");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileCode2 className="h-4 w-4 mr-1" /> Generar XML SIGA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5" /> XML SIGA · ImportDUA
            </DialogTitle>
            <DialogDescription>
              Vista previa del archivo XML para el sistema SIGA de la DGA. Estructura ImportDUA.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {!exp ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : valid ? (
              <Alert className="border-green-500/40 bg-green-500/5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Validación correcta</AlertTitle>
                <AlertDescription>Todos los campos obligatorios están completos. Puedes descargar el XML.</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Faltan {issues.length} campo(s) obligatorio(s)</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                    {issues.map((i) => <li key={i.field}>{i.label}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Vista previa XML</Label>
              <pre className="mt-1 p-3 rounded-md border bg-muted/40 text-xs overflow-auto max-h-[45vh] font-mono">
                {xml || "—"}
              </pre>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setCfgOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" /> Configurar agencia
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button onClick={handleDownload} disabled={!valid}>
              <Download className="h-4 w-4 mr-1" /> Descargar XML
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de la agencia</DialogTitle>
            <DialogDescription>Datos de ADECOMEX usados en todos los XML SIGA. Se guardan localmente en este navegador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Nombre de la agencia</Label>
              <Input value={broker.brokerName} onChange={(e) => setBroker({ ...broker, brokerName: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>RNC de la agencia</Label>
              <Input value={broker.brokerRnc} onChange={(e) => setBroker({ ...broker, brokerRnc: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Código de agencia (BrokerCompanyCode)</Label>
              <Input value={broker.brokerCompanyCode} onChange={(e) => setBroker({ ...broker, brokerCompanyCode: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Código de tramitador (BrokerEmployeeCode)</Label>
              <Input value={broker.brokerEmployeeCode} onChange={(e) => setBroker({ ...broker, brokerEmployeeCode: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCfg}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
