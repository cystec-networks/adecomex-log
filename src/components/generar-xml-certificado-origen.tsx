import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, AlertTriangle, Download, CheckCircle2, Info, Save, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DgaCombobox } from "@/components/dga-combobox";
import { downloadXml } from "@/lib/siga-xml";
import {
  buildCertificateOriginXml,
  validateCertificado,
  pendingCertificadoCodes,
  partidasUnicas,
  type CertMaps,
} from "@/lib/siga-certificado-origen-xml";

type CatRow = { codigo: string; nombre: string; estado?: string | null };

function useCatalogo(tabla: string, open: boolean) {
  return useQuery({
    queryKey: ["cat-cert", tabla, open],
    enabled: open,
    queryFn: async () =>
      ((await supabase.from(tabla as any).select("codigo, nombre, estado").order("nombre")).data ?? []) as unknown as CatRow[],
  });
}

export function GenerarXmlCertificadoOrigenButton({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: exp } = useQuery({
    queryKey: ["expediente-cert-xml", expedienteId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase.from("expedientes").select("*, clientes(*)").eq("id", expedienteId).maybeSingle()).data as any,
  });

  const { data: items } = useQuery({
    queryKey: ["expediente-cert-items", expedienteId, open],
    enabled: open,
    queryFn: async () =>
      (await supabase
        .from("mercancia_items")
        .select("*")
        .eq("expediente_id", expedienteId)
        .is("deleted_at", null)
        .order("item_no")).data ?? [],
  });

  const { data: usos } = useCatalogo("catalogo_uso_certificado", open);
  const { data: emisores } = useCatalogo("catalogo_tipo_emisor", open);
  const { data: tratamientos } = useCatalogo("catalogo_tratamientos_certificado", open);
  const { data: criterios } = useCatalogo("catalogo_criterio_origen", open);
  const { data: metodos } = useCatalogo("catalogo_metodo_calificacion", open);

  // Estado editable de la cabecera del certificado
  const [form, setForm] = useState<Record<string, string>>({});
  // HS code -> { criterio, metodo }
  const [detalles, setDetalles] = useState<Record<string, { criterio: string; metodo: string }>>({});

  useEffect(() => {
    if (!exp || !open) return;
    setForm({
      certificado_periodo_desde: exp.certificado_periodo_desde ?? "",
      certificado_periodo_hasta: exp.certificado_periodo_hasta ?? "",
      certificado_uso_codigo: exp.certificado_uso_codigo ?? "",
      certificado_emisor_codigo: exp.certificado_emisor_codigo ?? "",
      certificado_tratamiento_codigo: exp.certificado_tratamiento_codigo ?? "",
      certificado_transporte_desc: exp.certificado_transporte_desc ?? "",
      certificado_remark: exp.certificado_remark ?? "",
      certificado_productor_rnc: exp.certificado_productor_rnc ?? "",
      area_aduanera: exp.area_aduanera ?? "",
      area_aduanera_codigo: exp.area_aduanera_codigo ?? "",
      pais_origen: exp.pais_origen ?? "",
      pais_origen_codigo: exp.pais_origen_codigo ?? "",
    });
  }, [exp, open]);

  const partidas = useMemo(() => partidasUnicas((items as any[]) ?? []), [items]);

  useEffect(() => {
    if (partidas.length === 0) return;
    setDetalles((prev) => {
      const next = { ...prev };
      partidas.forEach((it: any) => {
        const hs = String(it.codigo_arancelario);
        if (!next[hs]) {
          next[hs] = {
            criterio: it.criterio_origen_codigo ?? "",
            metodo: it.metodo_calificacion_codigo ?? "",
          };
        }
      });
      return next;
    });
  }, [partidas]);

  const tratamientoMap = useMemo(() => {
    const m: Record<string, string> = {};
    (tratamientos ?? []).forEach((r) => { if (r.codigo) m[String(r.codigo)] = r.nombre; });
    return m;
  }, [tratamientos]);

  const maps: CertMaps = useMemo(() => ({ tratamientos: tratamientoMap }), [tratamientoMap]);

  // Expediente + ítems con los valores actualmente editados en el diálogo
  const expEdit = useMemo(() => {
    if (!exp) return exp;
    const out: any = { ...exp };
    Object.entries(form).forEach(([k, v]) => { out[k] = v || null; });
    return out;
  }, [exp, form]);

  const itemsEdit = useMemo(
    () =>
      partidas.map((it: any) => ({
        ...it,
        criterio_origen_codigo: detalles[String(it.codigo_arancelario)]?.criterio || null,
        metodo_calificacion_codigo: detalles[String(it.codigo_arancelario)]?.metodo || null,
      })),
    [partidas, detalles],
  );

  const issues = useMemo(() => (expEdit ? validateCertificado(expEdit, itemsEdit) : []), [expEdit, itemsEdit]);
  const pending = useMemo(() => (expEdit ? pendingCertificadoCodes(expEdit, itemsEdit, maps) : []), [expEdit, itemsEdit, maps]);
  const xml = useMemo(() => (expEdit ? buildCertificateOriginXml(expEdit, itemsEdit, maps) : ""), [expEdit, itemsEdit, maps]);
  const valid = issues.length === 0;

  const guardar = async () => {
    if (!exp) return;
    setSaving(true);
    const payload: any = {};
    Object.entries(form).forEach(([k, v]) => { payload[k] = v || null; });
    const { error } = await supabase.from("expedientes").update(payload).eq("id", expedienteId);
    if (error) { setSaving(false); return toast.error(error.message); }

    for (const it of partidas as any[]) {
      const d = detalles[String(it.codigo_arancelario)];
      if (!d) continue;
      const { error: e2 } = await supabase
        .from("mercancia_items")
        .update({
          criterio_origen_codigo: d.criterio || null,
          metodo_calificacion_codigo: d.metodo || null,
        })
        .eq("id", it.id);
      if (e2) { setSaving(false); return toast.error(e2.message); }
    }
    setSaving(false);
    await qc.invalidateQueries({ queryKey: ["expediente-cert-xml", expedienteId, open] });
    await qc.invalidateQueries({ queryKey: ["expediente-cert-items", expedienteId, open] });
    await qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    toast.success("Datos del certificado guardados");
  };

  const handleDownload = async () => {
    if (!exp) return;
    if (!valid) return toast.error("Corrige los errores antes de descargar");
    await guardar();
    downloadXml(`CERTORIGEN_${exp.numero}.xml`, xml);
    if (pending.length > 0) toast.warning(`XML descargado con ${pending.length} campo(s) sin código confirmado`);
    else toast.success("XML descargado");
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const catSelect = (
    value: string,
    onChange: (v: string) => void,
    rows: CatRow[] | undefined,
    placeholder: string,
  ) => (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__clear__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__clear__">Sin seleccionar</SelectItem>
        {(rows ?? []).map((r) => (
          <SelectItem key={r.codigo} value={r.codigo}>
            {r.codigo} · {r.nombre}
            {r.estado === "pendiente" ? " (pdte)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScrollText className="h-4 w-4 mr-1" /> Generar XML Certificado de Origen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" /> XML SIGA · CertificateOrigin
            </DialogTitle>
            <DialogDescription>
              Certificado de Origen electrónico para el sistema SIGA de la DGA.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4 pr-1">
            {!exp ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Período desde</Label>
                    <Input type="date" value={form.certificado_periodo_desde ?? ""} onChange={(e) => set("certificado_periodo_desde", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Período hasta</Label>
                    <Input type="date" value={form.certificado_periodo_hasta ?? ""} onChange={(e) => set("certificado_periodo_hasta", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Uso del certificado</Label>
                    {catSelect(form.certificado_uso_codigo ?? "", (v) => set("certificado_uso_codigo", v), usos, "Selecciona el uso")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tipo de emisor</Label>
                    {catSelect(form.certificado_emisor_codigo ?? "", (v) => set("certificado_emisor_codigo", v), emisores, "Selecciona el emisor")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tratamiento</Label>
                    {catSelect(form.certificado_tratamiento_codigo ?? "", (v) => set("certificado_tratamiento_codigo", v), tratamientos, "Selecciona el tratamiento")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Área / Administración aduanera</Label>
                    <DgaCombobox
                      table="dga_areas"
                      value={form.area_aduanera}
                      codigo={form.area_aduanera_codigo}
                      onChange={(nombre, codigo) => setForm((f) => ({ ...f, area_aduanera: nombre, area_aduanera_codigo: codigo }))}
                      placeholder="Selecciona área (catálogo DGA)"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>País de origen</Label>
                    <DgaCombobox
                      table="dga_paises"
                      value={form.pais_origen}
                      codigo={form.pais_origen_codigo}
                      onChange={(nombre, codigo) => setForm((f) => ({ ...f, pais_origen: nombre, pais_origen_codigo: codigo }))}
                      placeholder="Selecciona país (catálogo DGA)"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>RNC del productor (opcional)</Label>
                    <Input value={form.certificado_productor_rnc ?? ""} onChange={(e) => set("certificado_productor_rnc", e.target.value)} placeholder="130481301" />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Descripción de transporte</Label>
                    <Input value={form.certificado_transporte_desc ?? ""} onChange={(e) => set("certificado_transporte_desc", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Observaciones</Label>
                    <Textarea rows={2} value={form.certificado_remark ?? ""} onChange={(e) => set("certificado_remark", e.target.value)} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Partidas arancelarias del expediente</Label>
                  <div className="mt-1 rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-40">Partida (HS)</TableHead>
                          <TableHead>Criterio de origen</TableHead>
                          <TableHead>Método de calificación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partidas.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-sm text-muted-foreground text-center py-6">
                              No hay ítems de mercancía con código arancelario.
                            </TableCell>
                          </TableRow>
                        ) : (
                          partidas.map((it: any) => {
                            const hs = String(it.codigo_arancelario);
                            const d = detalles[hs] ?? { criterio: "", metodo: "" };
                            return (
                              <TableRow key={hs}>
                                <TableCell className="font-mono text-xs">{hs}</TableCell>
                                <TableCell>
                                  {catSelect(d.criterio, (v) => setDetalles((p) => ({ ...p, [hs]: { ...d, criterio: v } })), criterios, "Criterio")}
                                </TableCell>
                                <TableCell>
                                  {catSelect(d.metodo, (v) => setDetalles((p) => ({ ...p, [hs]: { ...d, metodo: v } })), metodos, "Método")}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {!valid ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Faltan {issues.length} campo(s) obligatorio(s)</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                        {issues.map((i) => <li key={i.field}>{i.label}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : pending.length > 0 ? (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10">
                    <Info className="h-4 w-4 text-yellow-700" />
                    <AlertTitle>Campos sin código confirmado</AlertTitle>
                    <AlertDescription>
                      Las etiquetas correspondientes se emitirán vacías. Revísalo antes de cargarlo a SIGA.
                      <ul className="list-disc pl-5 mt-2 space-y-0.5 text-sm">
                        {pending.map((i) => <li key={i.field}>{i.label}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-green-500/40 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle>Validación correcta</AlertTitle>
                    <AlertDescription>Puedes descargar el XML del Certificado de Origen.</AlertDescription>
                  </Alert>
                )}

                <div>
                  <Label className="text-xs text-muted-foreground">Vista previa XML</Label>
                  <pre className="mt-1 p-3 rounded-md border bg-muted/40 text-xs overflow-auto max-h-[35vh] font-mono">
                    {xml || "—"}
                  </pre>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={guardar} disabled={saving || !exp}>
              <Save className="h-4 w-4 mr-1" /> Guardar datos
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button onClick={handleDownload} disabled={!valid || saving}>
              <Download className="h-4 w-4 mr-1" /> Generar y descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
