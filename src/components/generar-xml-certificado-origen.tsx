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
import { TerceroExtranjeroPicker, type TerceroExtranjero } from "@/components/terceros-extranjeros";

/** Bloque Exportador/Productor del certificado (editable, alimentado del catálogo de terceros). */
type TerceroCert = {
  nombre: string; tipo_doc: string; doc: string; direccion: string; telefono: string;
  fax: string; email: string; pais_nombre: string; pais_codigo: string;
};
const TIPOS_DOC = [
  { v: "TID", l: "Tax ID" },
  { v: "RNC", l: "RNC" },
  { v: "CED", l: "Cédula" },
  { v: "PAS", l: "Pasaporte" },
];
const terceroVacio: TerceroCert = { nombre: "", tipo_doc: "TID", doc: "", direccion: "", telefono: "", fax: "", email: "", pais_nombre: "", pais_codigo: "" };
function separarDoc(raw?: string | null): { tipo_doc: string; doc: string } {
  const clean = String(raw ?? "").trim();
  const m = /^(RNC|CED|PAS|TID|TAX)[\s-]*(.*)$/i.exec(clean);
  if (m) return { tipo_doc: m[1].toUpperCase() === "TAX" ? "TID" : m[1].toUpperCase(), doc: m[2] };
  return { tipo_doc: "TID", doc: clean };
}
function desdeCatalogo(t: TerceroExtranjero): TerceroCert {
  return {
    nombre: t.nombre ?? "", ...separarDoc(t.tid), direccion: t.direccion ?? "", telefono: t.telefono ?? "",
    fax: t.fax ?? "", email: t.email ?? "", pais_nombre: t.pais_nombre ?? "", pais_codigo: t.pais_codigo ?? "",
  };
}
const docConPrefijo = (t: TerceroCert) => (t.doc.trim() ? `${t.tipo_doc}${t.doc.trim()}` : "");

function BloqueTercero({ titulo, value, onChange, sinCatalogo }: {
  titulo: string; value: TerceroCert; onChange: (t: TerceroCert) => void; sinCatalogo: boolean;
}) {
  const f = (k: keyof TerceroCert, label: string, span = false) => (
    <div className={`grid gap-1 ${span ? "sm:col-span-2" : ""}`}>
      <Label className="text-[11px]">{label}</Label>
      <Input className="h-8" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">{titulo}</p>
        <TerceroExtranjeroPicker onSelect={(t) => onChange(desdeCatalogo(t))} />
      </div>
      {sinCatalogo && (
        <p className="text-[11px] text-muted-foreground">
          Este embarcador aún no está en el Catálogo DGA. Usa «Elegir de catálogo → Agregar nuevo tercero extranjero» para guardarlo una sola vez.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {f("nombre", "Nombre", true)}
        <div className="grid gap-1">
          <Label className="text-[11px]">Documento</Label>
          <Select value={value.tipo_doc} onValueChange={(v) => onChange({ ...value, tipo_doc: v })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {f("doc", "Número de documento")}
        {f("direccion", "Dirección", true)}
        {f("telefono", "Teléfono")}
        {f("fax", "Fax")}
        {f("email", "Email")}
        {f("pais_nombre", "País")}
        {f("pais_codigo", "Código de país")}
      </div>
    </div>
  );
}
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
    staleTime: 0,
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

  // Área sugerida desde el Puerto de arribo (misma relación dga_puerto_area del expediente)
  const { data: areaPuerto } = useQuery({
    queryKey: ["cert-area-puerto", exp?.puerto_arribo_codigo, open],
    enabled: open && !!exp?.puerto_arribo_codigo,
    queryFn: async () => {
      const { data: rel } = await supabase.from("dga_puerto_area").select("area_codigo").eq("puerto_codigo", exp.puerto_arribo_codigo).maybeSingle();
      if (!rel?.area_codigo) return null;
      const { data: a } = await supabase.from("dga_areas").select("codigo, area").eq("codigo", rel.area_codigo).maybeSingle();
      return a ? { codigo: String((a as any).codigo), nombre: String((a as any).area ?? "") } : null;
    },
  });

  useEffect(() => {
    if (!exp || !open || !items) return;
    // Valores guardados mandan; si están vacíos se precargan defaults editables.
    const pad = (n: number) => String(n).padStart(2, "0");
    const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santo_Domingo" }));
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const desde = exp.certificado_periodo_desde || iso(hoy);
    const [y, m, d] = desde.slice(0, 10).split("-").map(Number);
    const hasta = new Date(y, m + 1, d);
    if (hasta.getDate() !== d) hasta.setDate(0); // fin de mes si no existe el día
    const tratamiento = exp.certificado_tratamiento_codigo || exp.acuerdo_codigo || "";
    const acuerdoTxt = String(exp.acuerdo_comercial || exp.preferencia_comercial || "").toUpperCase();
    const remarkDef = tratamiento === "1" || acuerdoTxt.includes("CAFTA")
      ? "PARA APLICAR PREFERENCIA ARANCELARIA DR-CAFTA, SEGUN CERTIFICADO DE ORIGEN Y DOCUMENTOS ADJUNTOS."
      : "PARA APLICAR PREFERENCIA ARANCELARIA EPA CON LA UNION EUROPEA, SEGUN CERTIFICADO DE ORIGEN Y DOCUMENTOS ADJUNTOS.";
    const paises = new Map<string, string>();
    (items as any[]).forEach((it) => { if (it.pais_origen_codigo) paises.set(String(it.pais_origen_codigo), it.pais_origen ?? ""); });
    const unico = paises.size === 1 ? [...paises.entries()][0] : null;
    setForm({
      certificado_periodo_desde: desde,
      certificado_periodo_hasta: exp.certificado_periodo_hasta || iso(hasta),
      certificado_uso_codigo: exp.certificado_uso_codigo || "IC50-002",
      certificado_emisor_codigo: exp.certificado_emisor_codigo || "IC51-001",
      certificado_tratamiento_codigo: tratamiento,
      certificado_transporte_desc: exp.certificado_transporte_desc || (exp.metodo_transporte_codigo === "IC52-001" ? "AEREO" : "MARITIMO"),
      certificado_remark: exp.certificado_remark || remarkDef,
      certificado_productor_rnc: exp.certificado_productor_rnc || exp.suplidor_rnc || "",
      area_aduanera: exp.area_aduanera || areaPuerto?.nombre || "",
      area_aduanera_codigo: exp.area_aduanera_codigo || areaPuerto?.codigo || "",
      pais_origen: unico ? unico[1] : paises.size > 1 ? "" : exp.pais_origen ?? "",
      pais_origen_codigo: unico ? unico[0] : paises.size > 1 ? "" : exp.pais_origen_codigo ?? "",
    });
  }, [exp, open, items, areaPuerto]);

  // Exportador y Productor: parten del Embarcador/Suplidor, buscado en el Catálogo DGA de terceros
  const [exportador, setExportador] = useState<TerceroCert>(terceroVacio);
  const [productor, setProductor] = useState<TerceroCert>(terceroVacio);
  const { data: terceroCat, isFetched: terceroBuscado } = useQuery({
    queryKey: ["cert-tercero-embarcador", exp?.suplidor_rnc, exp?.suplidor, open],
    enabled: open && !!exp && !!(exp?.suplidor_rnc || exp?.suplidor),
    queryFn: async () => {
      const tbl = supabase.from("catalogo_terceros_extranjeros" as any);
      const tid = String(exp.suplidor_rnc ?? "").trim();
      if (tid) {
        const { data } = await tbl.select("*").eq("activo", true).ilike("tid", tid).limit(1);
        if (data?.length) return data[0] as unknown as TerceroExtranjero;
      }
      const nombre = String(exp.suplidor ?? "").trim();
      if (nombre) {
        const { data } = await supabase.from("catalogo_terceros_extranjeros" as any).select("*").eq("activo", true).ilike("nombre", nombre).limit(1);
        if (data?.length) return data[0] as unknown as TerceroExtranjero;
      }
      return null;
    },
  });
  useEffect(() => {
    if (!open || !exp) return;
    const base: TerceroCert = terceroCat
      ? desdeCatalogo(terceroCat)
      : { ...terceroVacio, nombre: exp.suplidor ?? "", ...separarDoc(exp.suplidor_rnc) };
    setExportador(base);
    // Productor guardado distinto del embarcador: conservar su documento
    const prodGuardado = exp.certificado_productor_rnc && exp.certificado_productor_rnc !== exp.suplidor_rnc
      ? { ...terceroVacio, ...separarDoc(exp.certificado_productor_rnc) } : base;
    setProductor(prodGuardado);
  }, [open, exp, terceroCat]);
  const sinCatalogo = !!exp && terceroBuscado && !terceroCat && !!(exp?.suplidor_rnc || exp?.suplidor);

  const partidas = useMemo(() => partidasUnicas((items as any[]) ?? []), [items]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, { criterio: string; metodo: string }> = {};
    partidas.forEach((it: any) => {
      const hs = String(it.codigo_arancelario);
      next[hs] = {
        criterio: it.criterio_origen_codigo ?? "",
        metodo: it.metodo_calificacion_codigo ?? "",
      };
    });
    setDetalles(next);
  }, [partidas, open]);

  const tratamientoMap = useMemo(() => {
    const m: Record<string, string> = {};
    (tratamientos ?? []).forEach((r) => { if (r.codigo) m[String(r.codigo)] = r.nombre; });
    return m;
  }, [tratamientos]);

  const maps: CertMaps = useMemo(() => ({
    tratamientos: tratamientoMap,
    exportador: { doc: docConPrefijo(exportador), pais: exportador.pais_codigo || null },
    productor: { doc: docConPrefijo(productor), pais: productor.pais_codigo || null },
  }), [tratamientoMap, exportador, productor]);

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
    payload.certificado_productor_rnc = docConPrefijo(productor) || null;
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

  const [borrando, setBorrando] = useState(false);

  const borrarCertificado = async () => {
    setBorrando(true);
    const { error } = await supabase
      .from("expedientes")
      .update({
        certificado_periodo_desde: null,
        certificado_periodo_hasta: null,
        certificado_uso_codigo: null,
        certificado_emisor_codigo: null,
        certificado_tratamiento_codigo: null,
        certificado_transporte_desc: null,
        certificado_remark: null,
        certificado_productor_rnc: null,
      })
      .eq("id", expedienteId);
    if (error) { setBorrando(false); return toast.error(error.message); }

    const { error: e2 } = await supabase
      .from("mercancia_items")
      .update({
        criterio_origen_codigo: null,
        metodo_calificacion_codigo: null,
      })
      .eq("expediente_id", expedienteId);
    if (e2) { setBorrando(false); return toast.error(e2.message); }

    setForm({
      certificado_periodo_desde: "",
      certificado_periodo_hasta: "",
      certificado_uso_codigo: "",
      certificado_emisor_codigo: "",
      certificado_tratamiento_codigo: "",
      certificado_transporte_desc: "",
      certificado_remark: "",
      certificado_productor_rnc: "",
      area_aduanera: "",
      area_aduanera_codigo: "",
      pais_origen: "",
      pais_origen_codigo: "",
    });
    setDetalles({});
    setBorrando(false);
    await qc.invalidateQueries({ queryKey: ["expediente-cert-xml", expedienteId, open] });
    await qc.invalidateQueries({ queryKey: ["expediente-cert-items", expedienteId, open] });
    await qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    toast.success("Certificado borrado");
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
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Descripción de transporte</Label>
                    <Input value={form.certificado_transporte_desc ?? ""} onChange={(e) => set("certificado_transporte_desc", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Observaciones</Label>
                    <Textarea rows={2} value={form.certificado_remark ?? ""} onChange={(e) => set("certificado_remark", e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <BloqueTercero titulo="Información de Exportador" value={exportador} onChange={setExportador} sinCatalogo={sinCatalogo} />
                  <BloqueTercero titulo="Información de Productor" value={productor} onChange={setProductor} sinCatalogo={sinCatalogo} />
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={borrando || saving || !exp}>
                  <Trash2 className="h-4 w-4 mr-1" /> Borrar certificado
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar todos los datos del certificado de este Expediente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={borrarCertificado} disabled={borrando}>
                    {borrando ? "Borrando…" : "Borrar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
