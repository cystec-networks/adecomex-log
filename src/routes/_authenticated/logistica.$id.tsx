import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
import { EscanearBlButton, EscanearFacturaButton } from "@/components/escanear-documento-expediente-buttons";
import { type OcrExtraction } from "@/lib/ai-ocr.functions";
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
    { title: "Operación Logística | ADECOMEX" },
    { name: "description", content: "Registro y seguimiento, costos, documentos e incidencias de una operación logística." },
    { property: "og:title", content: "Operación Logística | ADECOMEX" },
    { property: "og:description", content: "Registro y seguimiento, costos, documentos e incidencias de una operación logística." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DetalleLogistica,
});

type FormState = {
  numero: string;
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
  numero: o.numero ?? "",
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
const EMPTY_FORM: FormState = formFrom({});

/** Documento en borrador (modo "nuevo"): se sube a storage y se inserta al crear la operación. */
export type DocumentoNuevo = { tipo: string; nombre_archivo: string; file: File };
export type IncidenciaNueva = { tipo: string; severidad: string; descripcion: string };

function DetalleLogistica() {
  const { id } = Route.useParams();
  const isNuevo = id === "nuevo";
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "logistica");
  const [modoEdicion, setModoEdicion] = useState(isNuevo);
  const [form, setForm] = useState<FormState | null>(isNuevo ? EMPTY_FORM : null);
  const [documentosNuevos, setDocumentosNuevos] = useState<DocumentoNuevo[]>([]);
  const [incidenciasNuevas, setIncidenciasNuevas] = useState<IncidenciaNueva[]>([]);
  const [incidenciasResueltas, setIncidenciasResueltas] = useState<number[]>([]);

  const { data: operacion, isLoading } = useQuery({ queryKey: ["operacion-logistica", id], enabled: !isNuevo, queryFn: async () => {
    const { data, error } = await supabase.from("operaciones_logistica").select("*, clientes(nombre)").eq("id", id).single();
    if (error) throw error; return data;
  }});
  const { data: etapas = [] } = useQuery({ queryKey: ["etapas-operacion-logistica", id], enabled: !isNuevo, queryFn: async () => {
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
  // Sincroniza el formulario con la operación cargada (solo modo edición de una existente).
  const [cargadoId, setCargadoId] = useState<string | null>(null);
  if (!isNuevo && operacion && cargadoId !== operacion.id) { setCargadoId(operacion.id); setForm(formFrom(operacion)); }
  const set = (key: keyof FormState, value: string) => setForm((p) => p ? ({ ...p, [key]: value }) : p);
  const done = etapas.filter((e) => e.estado === "completada").length;
  const total = etapas.length || 6;

  // Precarga de datos de la carga desde la Cotización u Orden vinculada (modo nuevo; todo queda editable).
  const prefill = async (fuente: "cotizacion" | "orden", registroId: string) => {
    try {
      if (fuente === "cotizacion") {
        const [{ data: cot }, { data: prods }] = await Promise.all([
          supabase.from("cotizaciones").select("origen,destino,incoterm,peso_kg,volumen_m3").eq("id", registroId).maybeSingle(),
          supabase.from("cotizacion_productos").select("detalle_producto").eq("cotizacion_id", registroId).limit(1),
        ]);
        if (!cot) return;
        setForm((p) => p && ({
          ...p,
          producto: p.producto || (prods?.[0]?.detalle_producto ?? ""),
          origen: p.origen || (cot.origen ?? ""), destino: p.destino || (cot.destino ?? ""),
          incoterm: p.incoterm || (cot.incoterm ?? ""),
          peso_bruto_kg: p.peso_bruto_kg || (cot.peso_kg != null ? String(cot.peso_kg) : ""),
          volumen_m3: p.volumen_m3 || (cot.volumen_m3 != null ? String(cot.volumen_m3) : ""),
        }));
      } else {
        const [{ data: ord }, { data: prods }] = await Promise.all([
          supabase.from("ordenes").select("cot_origen,cot_destino,cot_incoterm,cot_peso_kg,cot_volumen_m3").eq("id", registroId).maybeSingle(),
          supabase.from("orden_productos").select("detalle_producto").eq("orden_id", registroId).limit(1),
        ]);
        if (!ord) return;
        setForm((p) => p && ({
          ...p,
          producto: p.producto || (prods?.[0]?.detalle_producto ?? ""),
          origen: p.origen || (ord.cot_origen ?? ""), destino: p.destino || (ord.cot_destino ?? ""),
          incoterm: p.incoterm || (ord.cot_incoterm ?? ""),
          peso_bruto_kg: p.peso_bruto_kg || (ord.cot_peso_kg != null ? String(ord.cot_peso_kg) : ""),
          volumen_m3: p.volumen_m3 || (ord.cot_volumen_m3 != null ? String(ord.cot_volumen_m3) : ""),
        }));
      }
      toast.info("Datos de la carga precargados — puedes ajustarlos.");
    } catch { /* la precarga es opcional */ }
  };

  const aplicarOcr = (res: OcrExtraction) => {
    const tipoNorm = (() => {
      const m = (res.medio_transporte || "").toLowerCase();
      if (m.includes("aer") || m.includes("air") || m.includes("avi")) return "aereo";
      if (m.includes("mar") || m.includes("sea") || m.includes("nav") || m.includes("vessel")) return "maritimo";
      return form?.tipo ?? "maritimo";
    })();
    setForm((f) => f && ({
      ...f,
      proveedor_logistico: res.suplidor || f.proveedor_logistico,
      tipo: tipoNorm,
      origen: res.puerto_salida || f.origen,
      destino: res.puerto_arribo || f.destino,
      puerto_destino: res.puerto_arribo || f.puerto_destino,
      buque: res.naviera || f.buque,
      peso_bruto_kg: f.peso_bruto_kg || (res.peso_bruto_kg != null ? String(res.peso_bruto_kg) : ""),
      incoterm: res.incoterm || f.incoterm,
      producto: res.descripcion_mercancia || f.producto,
      bl_awb: res.numero_documento || f.bl_awb,
      observaciones: f.observaciones || (res.contenedores?.length ? `Contenedores: ${res.contenedores.map((c) => c.numero).join(", ")}` : ""),
    }));
    toast.success("Datos extraídos — revisa y ajusta los campos");
  };

  const numeric = (v: string) => v === "" ? null : Number(v);
  const nullable = (v: string) => v || null;
  const payloadFrom = (f: FormState) => ({
    numero: f.numero,
    cliente_id: nullable(f.cliente_id), responsable_id: nullable(f.responsable_id), tipo: f.tipo,
    proveedor_logistico: nullable(f.proveedor_logistico), proveedor_logistico_tid: nullable(f.proveedor_logistico_tid), booking: nullable(f.booking),
    proveedor_email: nullable(f.proveedor_email), proveedor_telefono: nullable(f.proveedor_telefono),
    producto: nullable(f.producto), origen: nullable(f.origen), destino: nullable(f.destino),
    puerto_destino: nullable(f.puerto_destino), buque: nullable(f.buque), incoterm: nullable(f.incoterm),
    peso_bruto_kg: numeric(f.peso_bruto_kg), volumen_m3: numeric(f.volumen_m3),
    bl_awb: nullable(f.bl_awb), contenedor: nullable(f.contenedor), fecha_recogida: nullable(f.fecha_recogida), fecha_embarque: nullable(f.fecha_embarque),
    fecha_salida: nullable(f.fecha_salida), eta: nullable(f.eta), fecha_arribo: nullable(f.fecha_arribo), flete_monto: numeric(f.flete_monto),
    flete_moneda: f.flete_moneda, seguro_monto: numeric(f.seguro_monto), gastos_locales_monto: numeric(f.gastos_locales_monto),
    otros_monto: numeric(f.otros_monto), observaciones: nullable(f.observaciones), cotizacion_id: nullable(f.cotizacion_id),
    orden_id: nullable(f.orden_id), expediente_id: nullable(f.expediente_id),
  });

  const saveMut = useMutation({ mutationFn: async () => {
    if (!form) return;
    const { error } = await supabase.from("operaciones_logistica").update(payloadFrom(form)).eq("id", id); if (error) {
      if (error.code === "23505") throw new Error("Ese número de operación ya está en uso — elige otro.");
      throw error;
    }
    await logAuditoria(id, "editado");
  }, onSuccess: () => { toast.success("Cambios guardados"); setModoEdicion(false); qc.invalidateQueries({ queryKey: ["operacion-logistica", id] }); qc.invalidateQueries({ queryKey: ["operaciones-logistica"] }); qc.invalidateQueries({ queryKey: ["auditoria-logistica", id] }); history.replaceState(null, "", `/logistica/${id}`); }, onError: (e: any) => toast.error(e.message) });

  const createMut = useMutation({ mutationFn: async () => {
    if (!form) throw new Error("Formulario incompleto.");
    if (!form.cliente_id) throw new Error("Selecciona un cliente.");
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("operaciones_logistica").insert({
      ...payloadFrom(form), numero: form.numero || "", creado_por: u.user?.id ?? null,
    }).select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("Ese número de operación ya está en uso — elige otro.");
      throw error;
    }
    const newId = data.id;
    // Documentos en borrador: subir a storage y registrar.
    for (const doc of documentosNuevos) {
      const safeName = doc.nombre_archivo.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `logistica/${newId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upError } = await supabase.storage.from("documentos").upload(path, doc.file);
      if (upError) { toast.error(`No se pudo subir ${doc.nombre_archivo}`); continue; }
      await supabase.from("logistica_documentos").insert({
        operacion_logistica_id: newId, tipo: doc.tipo, nombre_archivo: doc.nombre_archivo, documento_url: path, subido_por: u.user?.id ?? null,
      });
    }
    // Incidencias en borrador.
    for (const [idx, inc] of incidenciasNuevas.entries()) {
      const resuelta = incidenciasResueltas.includes(idx);
      await supabase.from("incidencias").insert({
        logistica_id: newId, tipo: inc.tipo, severidad: inc.severidad as "baja" | "media" | "alta" | "critica",
        descripcion: inc.descripcion || null, created_by: u.user?.id ?? null,
        ...(resuelta ? { estado: "resuelta" as const, fecha_resolucion: new Date().toISOString() } : {}),
      });
    }
    await logAuditoria(newId, "creado");
    return data;
  }, onSuccess: (data) => { toast.success("Operación creada"); qc.invalidateQueries({ queryKey: ["operaciones-logistica"] }); nav({ to: "/logistica/$id", params: { id: data.id }, search: { nuevo: "1" } }); }, onError: (e: any) => toast.error(e.message) });

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
  if (isLoading || !form || (!isNuevo && !operacion)) return <div className="p-8 text-muted-foreground">Cargando operación…</div>;
  const readOnly = !isNuevo && !modoEdicion;
  const Field = ({ label, name, type = "text" }: { label: string; name: keyof FormState; type?: string }) => <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={form[name]} disabled={readOnly} onChange={(e) => set(name, e.target.value)} /></div>;
  const LinkSelect = ({ label, name, rows }: { label: string; name: "cotizacion_id" | "orden_id" | "expediente_id"; rows: { id: string; numero: string | null }[] }) => <div className="space-y-1.5"><Label>{label}</Label><Select disabled={readOnly} value={form[name] || "none"} onValueChange={(v) => { const val = v === "none" ? "" : v; set(name, val); if (isNuevo && val && name === "cotizacion_id") void prefill("cotizacion", val); if (isNuevo && val && name === "orden_id") void prefill("orden", val); }}><SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger><SelectContent><SelectItem value="none">Sin vincular</SelectItem>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.numero ?? "Sin número"}</SelectItem>)}</SelectContent></Select></div>;

  const etapaActual = etapas.find((e) => e.estado === "en_curso");
  const idxActual = etapaActual ? etapas.findIndex((e) => e.id === etapaActual.id) : -1;
  const etapaSiguiente = idxActual >= 0 ? etapas[idxActual + 1] : undefined;
  const nombreEtapa = (codigo?: string) => ETAPAS_LOGISTICA.find((e) => e.codigo === codigo)?.nombre ?? codigo ?? "—";

  const datosConstancia = () => ({
    numero: form.numero,
    fechaInicio: fmtLocalDate(String(operacion?.created_at ?? "").slice(0, 10)),
    cliente: (operacion as any)?.clientes?.nombre ?? clientes.find((c) => c.id === form.cliente_id)?.nombre ?? null,
    producto: form.producto || null,
    origen: form.origen || null,
    destino: form.destino || form.puerto_destino || null,
    incoterm: form.incoterm || null,
    tipo: form.tipo === "aereo" ? "Aéreo" : "Marítimo",
    proveedorLogistico: form.proveedor_logistico || null,
    proveedorEmail: form.proveedor_email || null,
    proveedorTelefono: form.proveedor_telefono || null,
    responsable: responsables.find((r: any) => r.id === form.responsable_id)?.nombre ?? null,
    etapas: etapas.map((e) => ({ nombre: nombreEtapa(e.etapa_codigo), estado: e.estado })),
  });

  return <div className={cn("min-h-full transition-colors", isNuevo ? "bg-success/10" : modoEdicion ? "bg-warning/10" : "bg-background")}>
    <div className="sticky top-0 z-20 border-b bg-background px-6 py-3 shadow-sm">
      <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/logistica"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1">
          {isNuevo ? (
            <>
              <h1 className="font-display text-xl font-bold truncate">Nueva Operación de Logística</h1>
              <p className="text-sm text-muted-foreground truncate">Registra la carga desde su punto de origen.</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold truncate">
                {canEdit && !readOnly ? (
                  <Input
                    className="font-display text-2xl font-bold h-auto py-0 px-1 w-auto min-w-[8rem] max-w-[16rem] border-transparent hover:border-input focus-visible:border-input bg-transparent"
                    value={form.numero}
                    onChange={(e) => set("numero", e.target.value)}
                  />
                ) : (
                  form.numero
                )}
              </h1>
              <p className="text-sm text-muted-foreground truncate">{(operacion as any)?.clientes?.nombre ?? "Sin cliente"}</p>
            </>
          )}
        </div>
        {isNuevo ? (
          <>
            <EscanearBlButton onExtracted={aplicarOcr} />
            <EscanearFacturaButton onExtracted={aplicarOcr} />
            <Button disabled={createMut.isPending} onClick={() => createMut.mutate()} className="shadow-lg"><Save className="h-4 w-4 mr-2" />{createMut.isPending ? "Creando…" : "Crear operación"}</Button>
          </>
        ) : (
          <>
            <Badge variant="outline" className="capitalize">{form.tipo}</Badge><Badge className={estadoLogisticaClass(operacion!.estado)}>{ESTADO_LOGISTICA_LABEL[operacion!.estado] ?? operacion!.estado}</Badge>
            <div className="min-w-48"><div className="text-xs font-medium mb-1">Progreso: {done} de {total} etapas</div><Progress value={(done / total) * 100} /></div>
            <ConstanciaLogisticaButton datos={datosConstancia} />
            {modoEdicion && <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()} className="shadow-lg"><Save className="h-4 w-4 mr-2" />Guardar cambios</Button>}
          </>
        )}
      </div>
    </div>
    <main className="p-6 max-w-[1500px] mx-auto space-y-6">
      <Tabs defaultValue="operacion">
        <TabsList>
          <TabsTrigger value="operacion">Operación</TabsTrigger>
          <TabsTrigger value="historial" disabled={isNuevo} title={isNuevo ? "Disponible después de crear la operación." : undefined}>Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="operacion" className="space-y-6 mt-4">
      <Card><CardHeader><CardTitle className="text-base">Datos operativos</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5"><Label>Cliente{isNuevo && " *"}</Label><Select disabled={readOnly} value={form.cliente_id || "none"} onValueChange={(v) => set("cliente_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger><SelectContent><SelectItem value="none">Sin cliente</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Responsable</Label><Select disabled={readOnly} value={form.responsable_id || "none"} onValueChange={(v) => set("responsable_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{responsables.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Tipo</Label><Select disabled={readOnly} value={form.tipo} onValueChange={(v) => set("tipo", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maritimo">Marítimo</SelectItem><SelectItem value="aereo">Aéreo</SelectItem></SelectContent></Select></div>
        <Field label="Booking" name="booking" /><Field label="BL / AWB" name="bl_awb" /><Field label="Contenedor" name="contenedor" />
        <div className="space-y-1.5"><TerceroExtranjeroPicker label="Proveedor logístico" onSelect={(t) => setForm((p) => p ? ({ ...p, proveedor_logistico: t.nombre, proveedor_logistico_tid: t.tid ?? "" }) : p)} /><Input disabled={readOnly} value={form.proveedor_logistico} onChange={(e) => set("proveedor_logistico", e.target.value)} placeholder="Nombre del proveedor" /></div>
        <Field label="TID del proveedor" name="proveedor_logistico_tid" /><Field label="Correo del proveedor" name="proveedor_email" /><Field label="Teléfono del proveedor" name="proveedor_telefono" />
        <Field label="Fecha de recogida" name="fecha_recogida" type="date" /><Field label="Fecha de embarque" name="fecha_embarque" type="date" /><Field label="Fecha de salida" name="fecha_salida" type="date" /><Field label="ETA" name="eta" type="date" /><Field label="Fecha de arribo" name="fecha_arribo" type="date" />
        <LinkSelect label="Cotización de Compras" name="cotizacion_id" rows={vinculos?.cotizaciones ?? []} /><LinkSelect label="Orden de Compras" name="orden_id" rows={vinculos?.ordenes ?? []} /><LinkSelect label="Expediente" name="expediente_id" rows={vinculos?.expedientes ?? []} />
        <div className="sm:col-span-2 lg:col-span-4 space-y-1.5"><Label>Observaciones</Label><Textarea disabled={readOnly} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={3} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Datos de la carga</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sm:col-span-2 space-y-1.5"><Label>Producto</Label><Input disabled={readOnly} value={form.producto} onChange={(e) => set("producto", e.target.value)} /></div>
        <Field label="Origen" name="origen" /><Field label="Destino" name="destino" />
        <Field label="Puerto / aeropuerto de destino" name="puerto_destino" /><Field label="Buque / vuelo" name="buque" />
        <Field label="Peso bruto (kg)" name="peso_bruto_kg" type="number" /><Field label="Volumen (m³)" name="volumen_m3" type="number" />
        <Field label="Incoterm" name="incoterm" />
      </CardContent></Card>

      {!isNuevo && (
      <Card><CardHeader><CardTitle className="text-base">Progreso de la operación</CardTitle></CardHeader><CardContent className="space-y-3">
        <Progress value={(done / total) * 100} className="mb-5" />
        <div className="rounded-md border bg-muted/30 p-4 space-y-1">
          <div className="text-sm font-semibold flex items-center gap-2"><ArrowRight className="h-4 w-4 text-primary" />Próximas acciones</div>
          <p className="text-sm">{etapaActual ? `En curso: ${nombreEtapa(etapaActual.etapa_codigo)}` : "No hay etapas en curso — la operación está completada."}</p>
          {etapaSiguiente && <p className="text-sm text-muted-foreground">Próximo: {nombreEtapa(etapaSiguiente.etapa_codigo)}</p>}
        </div>
        <div className="grid lg:grid-cols-2 gap-3">{etapas.map((etapa, index) => {
          const def = ETAPAS_LOGISTICA.find((e) => e.codigo === etapa.etapa_codigo); const completed = etapa.estado === "completada"; const current = etapa.estado === "en_curso";
          return <div key={etapa.id} className={cn("border rounded-md p-4 flex gap-3 items-start", current && "border-primary bg-primary/5", completed && "border-success/30 bg-success/5")}>
            <div className="mt-0.5">{completed ? <CheckCircle2 className="h-5 w-5 text-success" /> : current ? <Clock className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</div>
            <div className="flex-1"><div className="font-medium">{index + 1}. {def?.nombre ?? etapa.etapa_codigo}</div><div className="text-xs text-muted-foreground mt-1">{completed ? `Completada ${fmtLocalDate(etapa.fecha_cumplimiento?.slice(0, 10))}` : current ? "En curso" : "Pendiente"}</div>{etapa.comentario && <p className="text-sm mt-2">{etapa.comentario}</p>}</div>
            {canEdit && current && <Button size="sm" onClick={() => completarEtapa.mutate(etapa.id)} disabled={completarEtapa.isPending}><Check className="h-4 w-4 mr-1" />Completar</Button>}
          </div>;
        })}</div>
      </CardContent></Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="text-base">Costos de Logística</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-4">
          <Field label="Flete internacional" name="flete_monto" type="number" /><div className="space-y-1.5"><Label>Moneda</Label><Select disabled={readOnly} value={form.flete_moneda} onValueChange={(v) => set("flete_moneda", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="DOP">DOP</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
          <Field label="Seguro" name="seguro_monto" type="number" /><Field label="Gastos locales" name="gastos_locales_monto" type="number" /><Field label="Otros costos" name="otros_monto" type="number" />
          <div className="sm:col-span-2 border-t pt-4 flex justify-between font-semibold"><span>Total registrado</span><span>{money(totalCostos, form.flete_moneda)}</span></div>
        </CardContent></Card>
        {isNuevo
          ? <DocumentosNuevosLogistica docs={documentosNuevos} setDocs={setDocumentosNuevos} />
          : <DocumentosLogistica id={id} canEdit={canEdit} />}
      </div>
      {isNuevo
        ? <IncidenciasNuevasLogistica incidencias={incidenciasNuevas} setIncidencias={setIncidenciasNuevas} resueltas={incidenciasResueltas} setResueltas={setIncidenciasResueltas} />
        : <IncidenciasLogistica id={id} canEdit={canEdit} />}
      {isNuevo
        ? <div className="sticky bottom-4 flex justify-end pointer-events-none"><Button size="lg" className="shadow-lg pointer-events-auto" disabled={createMut.isPending} onClick={() => createMut.mutate()}><Save className="h-4 w-4 mr-2" />{createMut.isPending ? "Creando…" : "Crear operación"}</Button></div>
        : canEdit && !modoEdicion
          ? <div className="sticky bottom-4 flex justify-end pointer-events-none"><Button size="lg" className="shadow-lg pointer-events-auto" onClick={() => setModoEdicion(true)}><Pencil className="h-4 w-4 mr-2" />Editar</Button></div>
          : modoEdicion
            ? <div className="sticky bottom-4 flex justify-end pointer-events-none"><Button size="lg" className="shadow-lg pointer-events-auto" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}><Save className="h-4 w-4 mr-2" />Guardar cambios</Button></div>
            : null}
        </TabsContent>

        {!isNuevo && <TabsContent value="historial" className="mt-4"><HistorialLogistica id={id} /></TabsContent>}
      </Tabs>
    </main>
  </div>;
}

const TIPOS_INCIDENCIA = ["Retraso del proveedor", "Retraso de recogida", "Incidencia documental", "Daño de carga", "Cambio de itinerario", "Cargo adicional", "Otro"];
const SEV_CLASS: Record<string, string> = { baja: "bg-muted text-muted-foreground", media: "bg-warning/15 text-warning-foreground", alta: "bg-destructive/15 text-destructive", critica: "bg-destructive text-destructive-foreground" };

function IncidenciasLogistica({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [form, setForm] = useState({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });
  const { data: incidencias = [] } = useQuery({ queryKey: ["incidencias-logistica", id], queryFn: async () => { const { data, error } = await supabase.from("incidencias").select("*").eq("logistica_id", id).order("fecha_apertura", { ascending: false }); if (error) throw error; return data ?? []; } });
  const createMut = useMutation({ mutationFn: async () => { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("incidencias").insert({ logistica_id: id, tipo: form.tipo, severidad: form.severidad as "baja" | "media" | "alta" | "critica", descripcion: form.descripcion || null, created_by: u.user?.id ?? null }); if (error) throw error; }, onSuccess: () => { toast.success("Incidencia registrada"); setOpen(false); setForm({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" }); qc.invalidateQueries({ queryKey: ["incidencias-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });
  const resolveMut = useMutation({ mutationFn: async (incidenciaId: string) => { const { error } = await supabase.from("incidencias").update({ estado: "resuelta", fecha_resolucion: new Date().toISOString() }).eq("id", incidenciaId); if (error) throw error; }, onSuccess: () => { toast.success("Incidencia resuelta"); qc.invalidateQueries({ queryKey: ["incidencias-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });
  return <Card><CardHeader className="flex-row items-center"><CardTitle className="text-base flex-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Incidencias</CardTitle>{canEdit && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Registrar incidencia</Button>}</CardHeader><CardContent>
    <div className="overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left py-2">Tipo</th><th className="text-left">Severidad</th><th className="text-left">Descripción</th><th className="text-left">Estado</th><th className="text-right">Acción</th></tr></thead><tbody>{incidencias.map((inc) => <tr key={inc.id} className="border-b"><td className="py-3">{inc.tipo}</td><td><Badge className={SEV_CLASS[inc.severidad]}>{inc.severidad}</Badge></td><td>{inc.descripcion ?? "—"}</td><td className="capitalize">{inc.estado.replace("_", " ")}</td><td className="text-right">{canEdit && !["resuelta", "cerrada"].includes(inc.estado) && <Button variant="ghost" size="sm" onClick={() => resolveMut.mutate(inc.id)}>Resolver</Button>}</td></tr>)}{incidencias.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin incidencias registradas.</td></tr>}</tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Registrar incidencia</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_INCIDENCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Severidad</Label><Select value={form.severidad} onValueChange={(v) => setForm((p) => ({ ...p, severidad: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["baja", "media", "alta", "critica"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>Registrar</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}

/** Incidencias en borrador (modo "nuevo"): estado local, se insertan al crear la operación. */
function IncidenciasNuevasLogistica({ incidencias, setIncidencias, resueltas, setResueltas }: {
  incidencias: IncidenciaNueva[]; setIncidencias: (v: IncidenciaNueva[]) => void;
  resueltas: number[]; setResueltas: (v: number[]) => void;
}) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });
  const add = () => {
    setIncidencias([...incidencias, { ...form }]);
    setOpen(false); setForm({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });
  };
  const removeAt = (idx: number) => { setIncidencias(incidencias.filter((_, i) => i !== idx)); setResueltas(resueltas.filter((r) => r !== idx).map((r) => (r > idx ? r - 1 : r))); };
  const toggleResuelta = (idx: number) => setResueltas(resueltas.includes(idx) ? resueltas.filter((r) => r !== idx) : [...resueltas, idx]);
  return <Card><CardHeader className="flex-row items-center"><CardTitle className="text-base flex-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Incidencias</CardTitle><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Registrar incidencia</Button></CardHeader><CardContent>
    <div className="overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left py-2">Tipo</th><th className="text-left">Severidad</th><th className="text-left">Descripción</th><th className="text-left">Estado</th><th className="text-right">Acción</th></tr></thead><tbody>{incidencias.map((inc, idx) => <tr key={idx} className="border-b"><td className="py-3">{inc.tipo}</td><td><Badge className={SEV_CLASS[inc.severidad]}>{inc.severidad}</Badge></td><td>{inc.descripcion || "—"}</td><td className="capitalize">{resueltas.includes(idx) ? "resuelta" : "abierta"}</td><td className="text-right space-x-1"><Button variant="ghost" size="sm" onClick={() => toggleResuelta(idx)}>{resueltas.includes(idx) ? "Reabrir" : "Resolver"}</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeAt(idx)}><X className="h-4 w-4" /></Button></td></tr>)}{incidencias.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin incidencias — se guardarán al crear la operación.</td></tr>}</tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Registrar incidencia</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_INCIDENCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Severidad</Label><Select value={form.severidad} onValueChange={(v) => setForm((p) => ({ ...p, severidad: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["baja", "media", "alta", "critica"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={add}>Agregar</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}

/** Documentos categorizados de la operación (Booking, BL/AWB, Lista de Empaque, HBL, Certificado de Origen, Otro). */
function DocumentosLogistica({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const { data: docs = [] } = useQuery({ queryKey: ["documentos-logistica", id], queryFn: async () => {
    const { data, error } = await supabase.from("logistica_documentos").select("*").eq("operacion_logistica_id", id).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  }});

  const uploadMut = useMutation({ mutationFn: async ({ tipo, file }: { tipo: string; file: File }) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `logistica/${id}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("documentos").upload(path, file); if (error) throw error;
    const { data: u } = await supabase.auth.getUser();
    const { error: insError } = await supabase.from("logistica_documentos").insert({
      operacion_logistica_id: id, tipo, nombre_archivo: file.name, documento_url: path, subido_por: u.user?.id ?? null,
    }); if (insError) throw insError;
    await logAuditoria(id, `documento_subido:${tipo}`, { nombre_archivo: file.name });
  }, onSuccess: () => { toast.success("Documento adjuntado"); qc.invalidateQueries({ queryKey: ["documentos-logistica", id] }); qc.invalidateQueries({ queryKey: ["auditoria-logistica", id] }); }, onError: (e: any) => toast.error(e.message), onSettled: () => setSubiendo(null) });

  const removeMut = useMutation({ mutationFn: async (doc: any) => {
    if (doc.documento_url) await supabase.storage.from("documentos").remove([doc.documento_url]);
    const { error } = await supabase.from("logistica_documentos").delete().eq("id", doc.id); if (error) throw error;
    await logAuditoria(id, `documento_eliminado:${doc.tipo}`, { nombre_archivo: doc.nombre_archivo });
  }, onSuccess: () => { toast.success("Documento quitado"); qc.invalidateQueries({ queryKey: ["documentos-logistica", id] }); qc.invalidateQueries({ queryKey: ["auditoria-logistica", id] }); }, onError: (e: any) => toast.error(e.message) });

  return <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Documentos de la operación</CardTitle></CardHeader><CardContent className="space-y-3">
    {TIPOS_DOCUMENTO.map((t) => {
      const propios = docs.filter((d) => d.tipo === t.codigo);
      return <div key={t.codigo} className="border rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium flex-1">{t.nombre}</span>
          {canEdit && <>
            <input ref={(el) => { inputRefs.current[t.codigo] = el; }} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) { setSubiendo(t.codigo); uploadMut.mutate({ tipo: t.codigo, file }); } e.target.value = ""; }} />
            <Button variant="outline" size="sm" disabled={subiendo === t.codigo} onClick={() => inputRefs.current[t.codigo]?.click()}>
              <Upload className="h-4 w-4 mr-1" />{subiendo === t.codigo ? "Subiendo…" : "Subir"}
            </Button>
          </>}
        </div>
        {propios.length === 0
          ? <p className="text-xs text-muted-foreground">Sin archivo cargado.</p>
          : propios.map((d) => <div key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{d.nombre_archivo ?? "Archivo"}</span>
              {d.documento_url && <DocumentoPreviewButton path={d.documento_url} label="Vista previa" />}
              {canEdit && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeMut.mutate(d)}><X className="h-4 w-4 mr-1" />Quitar</Button>}
            </div>)}
      </div>;
    })}
  </CardContent></Card>;
}

/** Documentos en borrador (modo "nuevo"): archivos en estado local, se suben al crear la operación. */
function DocumentosNuevosLogistica({ docs, setDocs }: { docs: DocumentoNuevo[]; setDocs: (v: DocumentoNuevo[]) => void }) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  return <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Documentos de la operación</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-xs text-muted-foreground">Los archivos se subirán al crear la operación.</p>
    {TIPOS_DOCUMENTO.map((t) => {
      const propios = docs.filter((d) => d.tipo === t.codigo);
      return <div key={t.codigo} className="border rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium flex-1">{t.nombre}</span>
          <input ref={(el) => { inputRefs.current[t.codigo] = el; }} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) setDocs([...docs, { tipo: t.codigo, nombre_archivo: file.name, file }]); e.target.value = ""; }} />
          <Button variant="outline" size="sm" onClick={() => inputRefs.current[t.codigo]?.click()}>
            <Upload className="h-4 w-4 mr-1" />Adjuntar
          </Button>
        </div>
        {propios.length === 0
          ? <p className="text-xs text-muted-foreground">Sin archivo cargado.</p>
          : propios.map((d, i) => <div key={`${d.nombre_archivo}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{d.nombre_archivo}</span>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDocs(docs.filter((x) => x !== d))}><X className="h-4 w-4 mr-1" />Quitar</Button>
            </div>)}
      </div>;
    })}
  </CardContent></Card>;
}

/** Bitácora de la operación (tabla auditoria, entidad = operaciones_logistica). */
function HistorialLogistica({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["auditoria-logistica", id], queryFn: async () => (await supabase
    .from("auditoria").select("*").eq("entidad", "operaciones_logistica").eq("entidad_id", id)
    .order("created_at", { ascending: false }).limit(100)).data ?? [] });
  return <Card>
    <CardHeader><CardTitle className="text-base">Bitácora</CardTitle></CardHeader>
    <CardContent className="p-0 overflow-auto max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
          <tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left">Acción</th><th className="text-left">Detalle</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((a: any) => <tr key={a.id} className="border-b last:border-0">
            <td className="px-4 py-2 text-xs">{new Date(a.created_at).toLocaleString("es-DO")}</td>
            <td className="text-xs font-mono">{a.accion}</td>
            <td className="text-xs text-muted-foreground">{a.cambios ? JSON.stringify(a.cambios) : "—"}</td>
          </tr>)}
          {(!data || data.length === 0) && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Sin registros aún.</td></tr>}
        </tbody>
      </table>
    </CardContent>
  </Card>;
}
