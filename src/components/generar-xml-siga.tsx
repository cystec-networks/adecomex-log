import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileCode2, AlertTriangle, Download, Settings2, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { DgaCombobox } from "@/components/dga-combobox";
import {
  buildImportDUAXml,
  downloadXml,
  loadBrokerConfig,
  saveBrokerConfig,
  validateExpediente,
  pendingDgaCodes,
  resolveRegimenCode,
  type BrokerConfig,
} from "@/lib/siga-xml";


export function GenerarXmlSigaButton({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [broker, setBroker] = useState<BrokerConfig>(() => loadBrokerConfig());
  const [savingArea, setSavingArea] = useState(false);
  const queryClient = useQueryClient();


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

  const { data: empleados } = useQuery({
    queryKey: ["empleados-despachantes", cfgOpen],
    enabled: cfgOpen,
    queryFn: async () =>
      (await supabase.from("empleados").select("id, nombre, cedula").is("deleted_at", null).eq("estado", "activo").order("nombre")).data ?? [],
  });

  const { data: regimenes } = useQuery({
    queryKey: ["catalogo-regimenes-xml", open],
    enabled: open,
    queryFn: async () => (await supabase.from("catalogo_regimenes").select("codigo, nombre")).data ?? [],
  });

  const regimenMap = useMemo(() => {
    const m: Record<string, string> = {};
    (regimenes ?? []).forEach((r: any) => { if (r.nombre && r.codigo) m[String(r.nombre).trim().toLowerCase()] = String(r.codigo); });
    return m;
  }, [regimenes]);

  const expConRegimen = useMemo(
    () => (exp ? { ...exp, regimen_codigo: resolveRegimenCode(exp, regimenMap) || null } : exp),
    [exp, regimenMap],
  );

  const issues = useMemo(() => (expConRegimen ? validateExpediente(expConRegimen, items ?? [], broker) : []), [expConRegimen, items, broker]);
  const pending = useMemo(() => (expConRegimen ? pendingDgaCodes(expConRegimen) : []), [expConRegimen]);
  const xml = useMemo(() => (expConRegimen ? buildImportDUAXml(expConRegimen, items ?? [], broker, regimenMap) : ""), [expConRegimen, items, broker, regimenMap]);
  const valid = issues.length === 0;

  const handleDownload = () => {
    if (!exp) return;
    if (!valid) return toast.error("Corrige los errores antes de descargar");
    downloadXml(`SIGA_${exp.numero}.xml`, xml);
    if (pending.length > 0) toast.warning(`XML descargado con ${pending.length} campo(s) sin código DGA`);
    else toast.success("XML descargado");
  };

  const handleSaveCfg = () => {
    saveBrokerConfig(broker);
    setCfgOpen(false);
    toast.success("Configuración de agencia guardada");
  };

  const guardarArea = async (codigo: string) => {
    if (!codigo) return;
    setSavingArea(true);
    const { error } = await supabase.from("expedientes").update({ area_aduanera_codigo: codigo }).eq("id", expedienteId);
    setSavingArea(false);
    if (error) return toast.error("No se pudo guardar el área aduanera");
    await queryClient.invalidateQueries({ queryKey: ["expediente-xml", expedienteId, open] });
    await queryClient.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    toast.success("Área aduanera guardada");
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
            ) : !valid ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Faltan {issues.length} campo(s) obligatorio(s)</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                    {issues.map((i) => <li key={i.field}>{i.label}</li>)}
                  </ul>
                  {issues.some((i) => i.field === "area_aduanera_codigo") && (
                    <div className="mt-3 rounded-md border bg-background p-3 space-y-1.5">
                      <Label className="text-xs">Selecciona el Área / Administración aduanera</Label>
                      <DgaCombobox
                        table="dga_areas"
                        codigo={exp?.area_aduanera_codigo ?? ""}
                        onChange={(_n, codigo) => guardarArea(codigo)}
                        placeholder="Buscar área (catálogo DGA)"
                        disabled={savingArea}
                      />
                      <p className="text-[11px] text-muted-foreground">Se guarda en el expediente al seleccionarla.</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>

            ) : pending.length > 0 ? (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <Info className="h-4 w-4 text-yellow-700" />
                <AlertTitle>Campos sin código DGA confirmado</AlertTitle>
                <AlertDescription>
                  Este XML contiene campos sin código DGA confirmado. Las etiquetas correspondientes se emitirán vacías. Revísalo antes de cargarlo al sistema SIGA.
                  <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                    {pending.map((i) => <li key={i.field}>{i.label}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-green-500/40 bg-green-500/5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Validación correcta</AlertTitle>
                <AlertDescription>Todos los campos obligatorios están completos. Puedes descargar el XML.</AlertDescription>
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
        <DialogContent className="max-w-md max-h-[85vh] overflow-auto">
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
              <Label>RNC de ADECOMEX para BrokerCompanyCode</Label>
              <Input
                value={broker.brokerCompanyCode}
                onChange={(e) => setBroker({ ...broker, brokerCompanyCode: e.target.value })}
                placeholder="130594181 → se emite RNC214130594181"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Licencia / código del despachante (BrokerEmployeeCode)</Label>
              <Input value={broker.brokerEmployeeCode} onChange={(e) => setBroker({ ...broker, brokerEmployeeCode: e.target.value })} placeholder="072-08" />
            </div>
            <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                <strong>Declarante</strong>: es el agente aduanero (persona) que despacha, no el importador ni la razón social.
              </p>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tomar de un empleado</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value=""
                  onChange={(e) => {
                    const emp = (empleados ?? []).find((x: any) => x.id === e.target.value);
                    if (emp) setBroker({ ...broker, declarantName: emp.nombre?.toUpperCase() ?? "", declarantCode: emp.cedula ?? "" });
                  }}
                >
                  <option value="">Seleccionar empleado…</option>
                  {(empleados ?? []).map((e: any) => (
                    <option key={e.id} value={e.id}>{e.nombre}{e.cedula ? ` · ${e.cedula}` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nombre del despachante (DeclarantName)</Label>
                <Input value={broker.declarantName} onChange={(e) => setBroker({ ...broker, declarantName: e.target.value })} placeholder="FRANCISCO ENERIO LOPEZ MARTINEZ" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Cédula del despachante (DeclarantCode)</Label>
                <Input value={broker.declarantCode} onChange={(e) => setBroker({ ...broker, declarantCode: e.target.value })} placeholder="00108459645" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nacionalidad del declarante (código DGA)</Label>
                <Input value={broker.declarantNationality} onChange={(e) => setBroker({ ...broker, declarantNationality: e.target.value })} placeholder="214" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo de despacho SIGA (ClearanceType)</Label>
              <Input value={broker.clearanceType} onChange={(e) => setBroker({ ...broker, clearanceType: e.target.value })} placeholder="IM4" />
            </div>
            <div className="grid gap-1.5">
              <Label>Código transportista (TransportCompanyCode)</Label>
              <Input value={broker.transportCompanyCode} onChange={(e) => setBroker({ ...broker, transportCompanyCode: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Nacionalidad del transportista (código DGA)</Label>
              <Input value={broker.transportNationality} onChange={(e) => setBroker({ ...broker, transportNationality: e.target.value })} placeholder="214" />
            </div>
            <div className="grid gap-1.5">
              <Label>Nacionalidad por defecto (código DGA)</Label>
              <Input value={broker.defaultNationality} onChange={(e) => setBroker({ ...broker, defaultNationality: e.target.value })} placeholder="214 = República Dominicana" />
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
