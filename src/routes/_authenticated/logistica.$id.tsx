import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, FileText, Pencil, Plus, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ETAPAS_LOGISTICA, ESTADO_LOGISTICA_LABEL, estadoLogisticaClass, money } from "@/lib/logistica";
import { fmtLocalDate } from "@/lib/dates";
import { useCurrentUser, useMyRoles } from "@/lib/auth-hooks";
import { TerceroExtranjeroPicker } from "@/components/terceros-extranjeros";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConstanciaLogisticaButton } from "@/components/constancia-logistica-button";

/** Registro de auditoría de la operación logística (mismo patrón que Expedientes). */
const logAuditoria = async (operacionId: string, accion: string, cambios?: Record<string, unknown>) => {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("auditoria").insert({
    entidad: "operaciones_logistica", entidad_id: operacionId, accion,
    usuario_id: u.user?.id ?? null, cambios: (cambios ?? null) as any,
  });
};

const TIPOS_DOCUMENTO = [
  { codigo: "booking", nombre: "Booking" },
  { codigo: "bl_awb", nombre: "BL / AWB" },
  { codigo: "packing_list", nombre: "Lista de Empaque" },
  { codigo: "hbl", nombre: "HBL" },
  { codigo: "certificado_origen", nombre: "Certificado de Origen" },
  { codigo: "otro", nombre: "Otro" },
] as const;

const searchSchema = z.object({ nuevo: fallback(z.string(), "").default("") });
export const Route = createFileRoute("/_authenticated/logistica/$id")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [
    { title: "Detalle de Operación Logística | ADECOMEX" },
    { name: "description", content: "Seguimiento, costos, documentos e incidencias de una operación logística." },
    { property: "og:title", content: "Detalle de Operación Logística | ADECOMEX" },
    { property: "og:description", content: "Seguimiento, costos, documentos e incidencias de una operación logística." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DetalleLogistica,
});

type FormState = {
  cliente_id: string; responsable_id: string; tipo: string; proveedor_logistico: string; proveedor_logistico_tid: string;
  proveedor_email: string; proveedor_telefono: string;
  producto: string; origen: string; destino: string; puerto_destino: string; buque: string;
  peso_bruto_kg: string; volumen_m3: string; incoterm: string;
  booking: string; bl_awb: string; contenedor: string; fecha_recogida: string; fecha_embarque: string; fecha_salida: string;
  eta: string; fecha_arribo: string; flete_monto: string; flete_moneda: string; seguro_monto: string;
  gastos_locales_monto: string; otros_monto: string; observaciones: string; cotizacion_id: string; orden_id: string; expediente_id: string;
};
const cleanDate = (v: string | null) => v?.slice(0, 10) ?? "";
const formFrom = (o: any): FormState => ({
  cliente_id: o.cliente_id ?? "", responsable_id: o.responsable_id ?? "", tipo: o.tipo ?? "maritimo",
  proveedor_logistico: o.proveedor_logistico ?? "", proveedor_logistico_tid: o.proveedor_logistico_tid ?? "",
  proveedor_email: o.proveedor_email ?? "", proveedor_telefono: o.proveedor_telefono ?? "",
  producto: o.producto ?? "", origen: o.origen ?? "", destino: o.destino ?? "", puerto_destino: o.puerto_destino ?? "", buque: o.buque ?? "",
  peso_bruto_kg: String(o.peso_bruto_kg ?? ""), volumen_m3: String(o.volumen_m3 ?? ""), incoterm: o.incoterm ?? "",
  booking: o.booking ?? "", bl_awb: o.bl_awb ?? "", contenedor: o.contenedor ?? "", fecha_recogida: cleanDate(o.fecha_recogida),
  fecha_embarque: cleanDate(o.fecha_embarque), fecha_salida: cleanDate(o.fecha_salida), eta: cleanDate(o.eta), fecha_arribo: cleanDate(o.fecha_arribo),
  flete_monto: String(o.flete_monto ?? ""), flete_moneda: o.flete_moneda ?? "USD", seguro_monto: String(o.seguro_monto ?? ""),
  gastos_locales_monto: String(o.gastos_locales_monto ?? ""), otros_monto: String(o.otros_monto ?? ""), observaciones: o.observaciones ?? "",
  cotizacion_id: o.cotizacion_id ?? "", orden_id: o.orden_id ?? "", expediente_id: o.expediente_id ?? "",
});

function DetalleLogistica() {
  const { id } = Route.useParams();
  const { nuevo } = Route.useSearch();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "logistica");
  const [modoEdicion, setModoEdicion] = useState(nuevo === "1");
  const [form, setForm] = useState<FormState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: operacion, isLoading } = useQuery({ queryKey: ["operacion-logistica", id], queryFn: async () => {
    const { data, error } = await supabase.from("operaciones_logistica").select("*, clientes(nombre)").eq("id", id).single();
    if (error) throw error; return data;
  }});
  const { data: etapas = [] } = useQuery({ queryKey: ["etapas-operacion-logistica", id], queryFn: async () => {
    const { data, error } = await supabase.from("operacion_logistica_etapas").select("*").eq("operacion_logistica_id", id);
    if (error) throw error; return (data ?? []).sort((a, b) => ETAPAS_LOGISTICA.findIndex((e) => e.codigo === a.etapa_codigo) - ETAPAS_LOGISTICA.findIndex((e) => e.codigo === b.etapa_codigo));
  }});
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes-activos-logistica"], queryFn: async () => {
    const { data, error } = await supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"); if (error) throw error; return data ?? [];
  }});
  const { data: responsables = [] } = useQuery({ queryKey: ["encargados-logistica"], queryFn: async () => {
    const { data, error } = await supabase.rpc("listar_encargados_logistica"); if (error) throw error; return data ?? [];
  }});
  const { data: vinculos } = useQuery({ queryKey: ["vinculos-detalle-logistica"], queryFn: async () => {
    const [c, o, e] = await Promise.all([
      supabase.from("cotizaciones").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
      supabase.from("ordenes").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
      supabase.from("expedientes").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
    ]); return { cotizaciones: c.data ?? [], ordenes: o.data ?? [], expedientes: e.data ?? [] };
  }});
  useEffect(() => { if (operacion) setForm(formFrom(operacion)); }, [operacion]);
  const set = (key: keyof FormState, value: string) => setForm((p) => p ? ({ ...p, [key]: value }) : p);
  const done = etapas.filter((e) => e.estado === "completada").length;
  const total = etapas.length || 6;

  const saveMut = useMutation({ mutationFn: async () => {
    if (!form) return;
    const numeric = (v: string) => v === "" ? null : Number(v);
    const nullable = (v: string) => v || null;
    const { error } = await supabase.from("operaciones_logistica").update({
      cliente_id: nullable(form.cliente_id), responsable_id: nullable(form.responsable_id), tipo: form.tipo,
      proveedor_logistico: nullable(form.proveedor_logistico), proveedor_logistico_tid: nullable(form.proveedor_logistico_tid), booking: nullable(form.booking),
      proveedor_email: nullable(form.proveedor_email), proveedor_telefono: nullable(form.proveedor_telefono),
      producto: nullable(form.producto), origen: nullable(form.origen), destino: nullable(form.destino),
      puerto_destino: nullable(form.puerto_destino), buque: nullable(form.buque), incoterm: nullable(form.incoterm),
      peso_bruto_kg: numeric(form.peso_bruto_kg), volumen_m3: numeric(form.volumen_m3),
      bl_awb: nullable(form.bl_awb), contenedor: nullable(form.contenedor), fecha_recogida: nullable(form.fecha_recogida), fecha_embarque: nullable(form.fecha_embarque),
      fecha_salida: nullable(form.fecha_salida), eta: nullable(form.eta), fecha_arribo: nullable(form.fecha_arribo), flete_monto: numeric(form.flete_monto),
      flete_moneda: form.flete_moneda, seguro_monto: numeric(form.seguro_monto), gastos_locales_monto: numeric(form.gastos_locales_monto),
      otros_monto: numeric(form.otros_monto), observaciones: nullable(form.observaciones), cotizacion_id: nullable(form.cotizacion_id),
      orden_id: nullable(form.orden_id), expediente_id: nullable(form.expediente_id),
    }).eq("id", id); if (error) throw error;
    await logAuditoria(id, "editado");
  }, onSuccess: () => { toast.success("Cambios guardados"); setModoEdicion(false); qc.invalidateQueries({ queryKey: ["operacion-logistica", id] }); qc.invalidateQueries({ queryKey: ["operaciones-logistica"] }); qc.invalidateQueries({ queryKey: ["auditoria-logistica", id] }); history.replaceState(null, "", `/logistica/${id}`); }, onError: (e: any) => toast.error(e.message) });

  const completarEtapa = useMutation({ mutationFn: async (etapaId: string) => {
    const currentIndex = etapas.findIndex((e) => e.id === etapaId);
    if (currentIndex < 0 || etapas[currentIndex].estado !== "en_curso") throw new Error("Solo puedes completar la etapa en curso.");
    const { error } = await supabase.from("operacion_logistica_etapas").update({ estado: "completada", fecha_cumplimiento: new Date().toISOString(), completado_por: user?.id ?? null }).eq("id", etapaId);
    if (error) throw error;
    const next = etapas[currentIndex + 1];
    if (next) {
      const { error: nextError } = await supabase.from("operacion_logistica_etapas").update({ estado: "en_curso" }).eq("id", next.id); if (nextError) throw nextError;
      const { error: opError } = await supabase.from("operaciones_logistica").update({ estado: next.etapa_codigo }).eq("id", id); if (opError) throw opError;
    } else {
      const { error: opError } = await supabase.from("operaciones_logistica").update({ estado: "completada" }).eq("id", id); if (opError) throw opError;
    }
    await logAuditoria(id, `etapa_completada:${etapas[currentIndex].etapa_codigo}`);
  }, onSuccess: () => { toast.success("Etapa completada"); qc.invalidateQueries({ queryKey: ["etapas-operacion-logistica", id] }); qc.invalidateQueries({ queryKey: ["operacion-logistica", id] }); qc.invalidateQueries({ queryKey: ["operaciones-logistica"] }); qc.invalidateQueries({ queryKey: ["auditoria-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });

  const totalCostos = useMemo(() => [form?.flete_monto, form?.seguro_monto, form?.gastos_locales_monto, form?.otros_monto].reduce<number>((sum, value) => sum + Number(value || 0), 0), [form]);
  if (isLoading || !operacion || !form) return <div className="p-8 text-muted-foreground">Cargando operación…</div>;
  const readOnly = !modoEdicion;
  const Field = ({ label, name, type = "text" }: { label: string; name: keyof FormState; type?: string }) => <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={form[name]} disabled={readOnly} onChange={(e) => set(name, e.target.value)} /></div>;
  const LinkSelect = ({ label, name, rows }: { label: string; name: "cotizacion_id" | "orden_id" | "expediente_id"; rows: { id: string; numero: string | null }[] }) => <div className="space-y-1.5"><Label>{label}</Label><Select disabled={readOnly} value={form[name] || "none"} onValueChange={(v) => set(name, v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger><SelectContent><SelectItem value="none">Sin vincular</SelectItem>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.numero ?? "Sin número"}</SelectItem>)}</SelectContent></Select></div>;

  return <div className={cn("min-h-full transition-colors", modoEdicion ? (nuevo === "1" ? "bg-success/10" : "bg-warning/10") : "bg-background")}>
    <div className="sticky top-0 z-20 border-b bg-background px-6 py-3 shadow-sm">
      <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/logistica"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1"><h1 className="font-display text-xl font-bold truncate">{operacion.numero}</h1><p className="text-sm text-muted-foreground truncate">{operacion.clientes?.nombre ?? "Sin cliente"}</p></div>
        <Badge variant="outline" className="capitalize">{operacion.tipo}</Badge><Badge className={estadoLogisticaClass(operacion.estado)}>{ESTADO_LOGISTICA_LABEL[operacion.estado] ?? operacion.estado}</Badge>
        <div className="min-w-48"><div className="text-xs font-medium mb-1">Progreso: {done} de {total} etapas</div><Progress value={(done / total) * 100} /></div>
        {modoEdicion && <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()} className="shadow-lg"><Save className="h-4 w-4 mr-2" />Guardar cambios</Button>}
      </div>
    </div>
    <main className="p-6 max-w-[1500px] mx-auto space-y-6">
      <Card><CardHeader><CardTitle className="text-base">Datos operativos</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5"><Label>Cliente</Label><Select disabled={readOnly} value={form.cliente_id || "none"} onValueChange={(v) => set("cliente_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin cliente</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Responsable</Label><Select disabled={readOnly} value={form.responsable_id || "none"} onValueChange={(v) => set("responsable_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{responsables.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Tipo</Label><Select disabled={readOnly} value={form.tipo} onValueChange={(v) => set("tipo", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maritimo">Marítimo</SelectItem><SelectItem value="aereo">Aéreo</SelectItem></SelectContent></Select></div>
        <Field label="Booking" name="booking" /><Field label="BL / AWB" name="bl_awb" /><Field label="Contenedor" name="contenedor" />
        <div className="space-y-1.5"><TerceroExtranjeroPicker label="Proveedor logístico" onSelect={(t) => setForm((p) => p ? ({ ...p, proveedor_logistico: t.nombre, proveedor_logistico_tid: t.tid ?? "" }) : p)} /><Input disabled={readOnly} value={form.proveedor_logistico} onChange={(e) => set("proveedor_logistico", e.target.value)} /></div>
        <Field label="TID del proveedor" name="proveedor_logistico_tid" /><Field label="Fecha de recogida" name="fecha_recogida" type="date" /><Field label="Fecha de embarque" name="fecha_embarque" type="date" /><Field label="Fecha de salida" name="fecha_salida" type="date" /><Field label="ETA" name="eta" type="date" /><Field label="Fecha de arribo" name="fecha_arribo" type="date" />
        <LinkSelect label="Cotización de Compras" name="cotizacion_id" rows={vinculos?.cotizaciones ?? []} /><LinkSelect label="Orden de Compras" name="orden_id" rows={vinculos?.ordenes ?? []} /><LinkSelect label="Expediente" name="expediente_id" rows={vinculos?.expedientes ?? []} />
        <div className="sm:col-span-2 lg:col-span-4 space-y-1.5"><Label>Observaciones</Label><Textarea disabled={readOnly} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={3} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Progreso de la operación</CardTitle></CardHeader><CardContent className="space-y-3">
        <Progress value={(done / total) * 100} className="mb-5" />
        <div className="grid lg:grid-cols-2 gap-3">{etapas.map((etapa, index) => {
          const def = ETAPAS_LOGISTICA.find((e) => e.codigo === etapa.etapa_codigo); const completed = etapa.estado === "completada"; const current = etapa.estado === "en_curso";
          return <div key={etapa.id} className={cn("border rounded-md p-4 flex gap-3 items-start", current && "border-primary bg-primary/5", completed && "border-success/30 bg-success/5")}>
            <div className="mt-0.5">{completed ? <CheckCircle2 className="h-5 w-5 text-success" /> : current ? <Clock className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</div>
            <div className="flex-1"><div className="font-medium">{index + 1}. {def?.nombre ?? etapa.etapa_codigo}</div><div className="text-xs text-muted-foreground mt-1">{completed ? `Completada ${fmtLocalDate(etapa.fecha_cumplimiento?.slice(0, 10))}` : current ? "En curso" : "Pendiente"}</div>{etapa.comentario && <p className="text-sm mt-2">{etapa.comentario}</p>}</div>
            {canEdit && current && <Button size="sm" onClick={() => completarEtapa.mutate(etapa.id)} disabled={completarEtapa.isPending}><Check className="h-4 w-4 mr-1" />Completar</Button>}
          </div>;
        })}</div>
      </CardContent></Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="text-base">Costos de Logística</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-4">
          <Field label="Flete internacional" name="flete_monto" type="number" /><div className="space-y-1.5"><Label>Moneda</Label><Select disabled={readOnly} value={form.flete_moneda} onValueChange={(v) => set("flete_moneda", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="DOP">DOP</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
          <Field label="Seguro" name="seguro_monto" type="number" /><Field label="Gastos locales" name="gastos_locales_monto" type="number" /><Field label="Otros costos" name="otros_monto" type="number" />
          <div className="sm:col-span-2 border-t pt-4 flex justify-between font-semibold"><span>Total registrado</span><span>{money(totalCostos, form.flete_moneda)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Documento adjunto</CardTitle></CardHeader><CardContent className="space-y-4">
          {operacion.documento_url ? <div className="flex flex-wrap items-center gap-2"><DocumentoPreviewButton path={operacion.documento_url} label="Vista previa" />{modoEdicion && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeDoc.mutate()}><X className="h-4 w-4 mr-1" />Quitar</Button>}</div> : <p className="text-sm text-muted-foreground">No hay documento adjunto.</p>}
          {modoEdicion && <><input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadMut.mutate(file); e.target.value = ""; }} /><Button variant="outline" disabled={uploadMut.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />{uploadMut.isPending ? "Subiendo…" : "Cargar documento"}</Button></>}
        </CardContent></Card>
      </div>
      <IncidenciasLogistica id={id} canEdit={canEdit} />
      {canEdit && !modoEdicion && <div className="sticky bottom-4 flex justify-end pointer-events-none"><Button size="lg" className="shadow-lg pointer-events-auto" onClick={() => setModoEdicion(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button></div>}
      {modoEdicion && <div className="sticky bottom-4 flex justify-end pointer-events-none"><Button size="lg" className="shadow-lg pointer-events-auto" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}><Save className="h-4 w-4 mr-2" />Guardar cambios</Button></div>}
    </main>
  </div>;
}

const TIPOS_INCIDENCIA = ["Retraso del proveedor", "Retraso de recogida", "Incidencia documental", "Daño de carga", "Cambio de itinerario", "Cargo adicional", "Otro"];
function IncidenciasLogistica({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [form, setForm] = useState({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });
  const { data: incidencias = [] } = useQuery({ queryKey: ["incidencias-logistica", id], queryFn: async () => { const { data, error } = await supabase.from("incidencias").select("*").eq("logistica_id", id).order("fecha_apertura", { ascending: false }); if (error) throw error; return data ?? []; } });
  const createMut = useMutation({ mutationFn: async () => { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("incidencias").insert({ logistica_id: id, tipo: form.tipo, severidad: form.severidad as "baja" | "media" | "alta" | "critica", descripcion: form.descripcion || null, created_by: u.user?.id ?? null }); if (error) throw error; }, onSuccess: () => { toast.success("Incidencia registrada"); setOpen(false); setForm({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" }); qc.invalidateQueries({ queryKey: ["incidencias-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });
  const resolveMut = useMutation({ mutationFn: async (incidenciaId: string) => { const { error } = await supabase.from("incidencias").update({ estado: "resuelta", fecha_resolucion: new Date().toISOString() }).eq("id", incidenciaId); if (error) throw error; }, onSuccess: () => { toast.success("Incidencia resuelta"); qc.invalidateQueries({ queryKey: ["incidencias-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });
  const sevClass: Record<string, string> = { baja: "bg-muted text-muted-foreground", media: "bg-warning/15 text-warning-foreground", alta: "bg-destructive/15 text-destructive", critica: "bg-destructive text-destructive-foreground" };
  return <Card><CardHeader className="flex-row items-center"><CardTitle className="text-base flex-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Incidencias</CardTitle>{canEdit && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Registrar incidencia</Button>}</CardHeader><CardContent>
    <div className="overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left py-2">Tipo</th><th className="text-left">Severidad</th><th className="text-left">Descripción</th><th className="text-left">Estado</th><th className="text-right">Acción</th></tr></thead><tbody>{incidencias.map((inc) => <tr key={inc.id} className="border-b"><td className="py-3">{inc.tipo}</td><td><Badge className={sevClass[inc.severidad]}>{inc.severidad}</Badge></td><td>{inc.descripcion ?? "—"}</td><td className="capitalize">{inc.estado.replace("_", " ")}</td><td className="text-right">{canEdit && !["resuelta", "cerrada"].includes(inc.estado) && <Button variant="ghost" size="sm" onClick={() => resolveMut.mutate(inc.id)}>Resolver</Button>}</td></tr>)}{incidencias.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin incidencias registradas.</td></tr>}</tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Registrar incidencia</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_INCIDENCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Severidad</Label><Select value={form.severidad} onValueChange={(v) => setForm((p) => ({ ...p, severidad: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["baja", "media", "alta", "critica"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>Registrar</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}