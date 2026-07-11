import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, Circle, Clock, XCircle, Upload, Plus, FileText, AlertTriangle, DollarSign } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AutocompleteInput } from "@/components/autocomplete-input";

const SUG_MEDIO = ["Marítimo", "Aéreo", "Terrestre", "Courier", "Multimodal"];
const SUG_NAVIERA = ["Maersk", "MSC", "CMA CGM", "Hapag-Lloyd", "Evergreen", "ONE", "Cosco", "Seaboard Marine", "King Ocean", "ZIM", "Copa Cargo", "DHL", "FedEx", "UPS"];
const SUG_PAIS = ["China", "Estados Unidos", "España", "México", "Colombia", "Panamá", "Brasil", "Alemania", "Italia", "Turquía", "India", "Corea del Sur", "Japón", "Vietnam", "Chile", "Argentina", "Perú", "Guatemala", "Costa Rica", "Países Bajos"];
const SUG_INCOTERM = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const SUG_PUERTO_SALIDA = ["Shanghai", "Ningbo", "Shenzhen", "Hong Kong", "Busan", "Kaohsiung", "Miami", "Port Everglades", "Jacksonville", "Houston", "New York", "Valencia", "Barcelona", "Algeciras", "Rotterdam", "Hamburgo", "Amberes", "Cartagena", "Manzanillo (PA)", "Balboa"];
const SUG_PUERTO_ARRIBO = ["Puerto Multimodal Caucedo", "Puerto de Haina Oriental", "Puerto de Haina Occidental", "Puerto de Río Haina", "Puerto de Boca Chica", "Puerto de Manzanillo", "Puerto Plata", "AILA (Las Américas)", "AIC (Cibao)", "AIP (Punta Cana)", "Aeropuerto La Isabela"];
const SUG_PREFERENCIA = ["DR-CAFTA", "EPA (Unión Europea)", "ALADI", "SGP", "Ninguna"];

export const Route = createFileRoute("/_authenticated/expedientes/$id")({
  component: DetalleExpediente,
});

const TIPOS_DOC = [
  "Factura proforma","Factura comercial","Bill of Lading","Guía aérea","Lista de empaque",
  "Certificado de origen","Certificado sanitario","Permiso previo","Orden de compra",
  "Carta de instrucción","Póliza de seguro","DUA","Evidencia de entrega","Otro",
];

const TIPOS_INCIDENCIA = [
  "Documento faltante","Inconsistencia en factura","Diferencia de peso/cantidad",
  "Retención en aduana","Inspección física","Retraso de naviera","Cargo adicional","Dirección incorrecta","Otro",
];

const CONCEPTOS_COSTO = [
  "Flete internacional","Seguro","Gastos portuarios","Manejo de terminal","Honorarios",
  "Aranceles","ITBIS","Transporte local","Otros",
];

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 rounded-md border bg-background/50 flex items-center text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function DetalleExpediente() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: exp } = useQuery({
    queryKey: ["expediente", id],
    queryFn: async () => (await supabase.from("expedientes").select("*, clientes(*), solicitudes(numero)").eq("id", id).maybeSingle()).data,
  });

  const updateEstado = useMutation({
    mutationFn: async (estado: string) => {
      const { error } = await supabase.from("expedientes").update({ estado: estado as any }).eq("id", id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: id, accion: `cambio_estado:${estado}` });
    },
    onSuccess: () => { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["expediente", id] }); },
  });

  if (!exp) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/expedientes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {exp.numero}
            <Badge className="bg-primary/10 text-primary border-transparent">{exp.estado?.replace("_"," ")}</Badge>
            {exp.solicitudes?.numero && <Badge variant="outline">← {exp.solicitudes.numero}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{exp.clientes?.nombre ?? "Sin cliente"} · BL/AWB: {exp.bl_awb ?? "—"}</p>
        </div>
        <Select value={exp.estado} onValueChange={(v) => updateEstado.mutate(v)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["digitar","presentar","verificar","facturar","despachado"].map((e) => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="timeline">Flujo / Timeline</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="transportes">Transportes</TabsTrigger>
          <TabsTrigger value="inc">Incidencias</TabsTrigger>
          <TabsTrigger value="cost">Finanzas</TabsTrigger>
          <TabsTrigger value="aud">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="info"><TabInfo exp={exp} /></TabsContent>
        <TabsContent value="timeline"><TabTimeline expedienteId={id} /></TabsContent>
        <TabsContent value="docs"><TabDocumentos expedienteId={id} /></TabsContent>
        <TabsContent value="permisos"><TabPermisosExp expedienteId={id} /></TabsContent>
        <TabsContent value="transportes"><TabTransportesExp expedienteId={id} /></TabsContent>
        <TabsContent value="inc"><TabIncidencias expedienteId={id} /></TabsContent>
        <TabsContent value="cost"><TabCostos expedienteId={id} /></TabsContent>
        <TabsContent value="aud"><TabAuditoria expedienteId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabInfo({ exp }: { exp: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    numero: exp.numero ?? "",
    bl_awb: exp.bl_awb ?? "",
    sla_dias: exp.sla_dias ?? 15,
    fecha_compromiso: exp.fecha_compromiso ?? "",
    etapa_actual: exp.etapa_actual ?? 1,
    medio_transporte: exp.medio_transporte ?? "",
    naviera: exp.naviera ?? "",
    suplidor: exp.suplidor ?? "",
    pais_origen: exp.pais_origen ?? "",
    factura_comercial: exp.factura_comercial ?? "",
    incoterm: exp.incoterm ?? "",
    puerto_salida: exp.puerto_salida ?? "",
    puerto_arribo: exp.puerto_arribo ?? "",
    numero_dua: exp.numero_dua ?? "",
    numero_vuce: exp.numero_vuce ?? "",
    numero_igra: exp.numero_igra ?? "",
    descripcion_mercancia: exp.descripcion_mercancia ?? "",
    peso_neto: exp.peso_neto ?? "",
    peso_bruto: exp.peso_bruto ?? "",
    numeros_contenedores: exp.numeros_contenedores ?? "",
    preferencia_comercial: exp.preferencia_comercial ?? "",
    canal_riesgo: exp.canal_riesgo ?? "",
    observaciones: exp.observaciones ?? "",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Pull existing values across expedientes to feed suggestions dynamically
  const { data: histDb } = useQuery({
    queryKey: ["expedientes-hist"],
    queryFn: async () =>
      (
        await supabase
          .from("expedientes")
          .select(
            "medio_transporte, naviera, suplidor, pais_origen, factura_comercial, incoterm, puerto_salida, puerto_arribo, numero_dua, numero_vuce, numero_igra, preferencia_comercial, numeros_contenedores"
          )
          .limit(500)
      ).data ?? [],
  });

  const sug = useMemo(() => {
    const uniq = (key: string, base: string[] = []) => {
      const set = new Set<string>(base);
      (histDb ?? []).forEach((r: any) => {
        const v = (r?.[key] ?? "").toString().trim();
        if (v) set.add(v);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    };
    return {
      medio_transporte: uniq("medio_transporte", SUG_MEDIO),
      naviera: uniq("naviera", SUG_NAVIERA),
      suplidor: uniq("suplidor"),
      pais_origen: uniq("pais_origen", SUG_PAIS),
      factura_comercial: uniq("factura_comercial"),
      incoterm: uniq("incoterm", SUG_INCOTERM),
      puerto_salida: uniq("puerto_salida", SUG_PUERTO_SALIDA),
      puerto_arribo: uniq("puerto_arribo", SUG_PUERTO_ARRIBO),
      numero_dua: uniq("numero_dua"),
      numero_vuce: uniq("numero_vuce"),
      numero_igra: uniq("numero_igra"),
      preferencia_comercial: uniq("preferencia_comercial", SUG_PREFERENCIA),
      numeros_contenedores: uniq("numeros_contenedores"),
    };
  }, [histDb]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      payload.peso_neto = payload.peso_neto === "" ? null : Number(payload.peso_neto);
      payload.peso_bruto = payload.peso_bruto === "" ? null : Number(payload.peso_bruto);
      const { error } = await supabase.from("expedientes").update(payload).eq("id", exp.id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: exp.id, accion: "editado" });
    },
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["expediente", exp.id] }); qc.invalidateQueries({ queryKey: ["expedientes"] }); qc.invalidateQueries({ queryKey: ["expedientes-hist"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const Field = ({ label, k, type = "text", className = "" }: { label: string; k: keyof typeof form; type?: string; className?: string }) => (
    <div className={`grid gap-1.5 ${className}`}>
      <Label>{label}</Label>
      <Input type={type} value={form[k] as any} onChange={(e) => set(k as string, e.target.value)} />
    </div>
  );

  const AutoField = ({ label, k, className = "" }: { label: string; k: keyof typeof sug; className?: string }) => (
    <div className={`grid gap-1.5 ${className}`}>
      <Label>{label}</Label>
      <AutocompleteInput
        value={(form as any)[k] ?? ""}
        onChange={(v) => set(k as string, v)}
        suggestions={sug[k] ?? []}
        placeholder={`Escribe para buscar ${label.toLowerCase()}…`}
      />
    </div>
  );

  const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  );

  const hasSolicitud = !!(exp.solicitud_id || exp.tipo_operacion || exp.tipo_carga || exp.contacto_solicitud);

  return (
    <div className="space-y-5">
      {hasSolicitud && (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
              <span>Datos de la Solicitud Original</span>
              {exp.solicitudes?.numero && exp.solicitud_id && (
                <Link to="/solicitudes/$id" params={{ id: exp.solicitud_id }} className="text-xs font-normal text-primary underline">
                  {exp.solicitudes.numero} ↗
                </Link>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Referencia conservada al momento de la conversión (solo lectura).</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Tipo de operación" value={exp.tipo_operacion} />
            <ReadOnlyField label="Tipo de carga" value={exp.tipo_carga} />
            <ReadOnlyField label="Origen" value={exp.pais_origen} />
            <ReadOnlyField label="Incoterm" value={exp.incoterm} />
            <ReadOnlyField label="Medio de transporte" value={exp.medio_transporte} />
            <ReadOnlyField label="Contacto" value={exp.contacto_solicitud} />
          </CardContent>
        </Card>
      )}

      <Section title="1. Información general" subtitle="Identificación y logística base del expediente">
        <Field label="Número / ID" k="numero" />
        <Field label="BL / AWB / Guía" k="bl_awb" />
        <AutoField label="Medio de transporte" k="medio_transporte" />
        <AutoField label="Naviera" k="naviera" />
        <Field label="SLA (días)" k="sla_dias" type="number" />
        <Field label="Fecha Estimada de Llegada (ETA)" k="fecha_compromiso" type="date" />
        <Field label="Etapa actual (1-14)" k="etapa_actual" type="number" />
      </Section>


      <Section title="2. Datos de importación" subtitle="Origen, proveedor y términos comerciales">
        <AutoField label="Suplidor" k="suplidor" />
        <AutoField label="País de origen" k="pais_origen" />
        <AutoField label="Factura comercial" k="factura_comercial" />
        <AutoField label="Incoterm" k="incoterm" />
        <AutoField label="Puerto de salida" k="puerto_salida" />
      </Section>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">3. Declaración</CardTitle>
          <p className="text-xs text-muted-foreground">Documentos oficiales ante DGA y VUCE</p>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <AutoField label="Declaración DUA" k="numero_dua" />
          <AutoField label="Número de despacho" k="numero_igra" />
          <AutoField label="Número de permiso" k="numero_vuce" />
          <AutoField label="Puerto de arribo" k="puerto_arribo" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">4. Descripción de mercancía</CardTitle>
          <p className="text-xs text-muted-foreground">Detalle físico y clasificación de la carga</p>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
            <Label>Descripción</Label>
            <Textarea rows={3} value={form.descripcion_mercancia} onChange={(e) => set("descripcion_mercancia", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Peso neto (kg)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.peso_neto ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^\d*\.?\d*$/.test(v)) set("peso_neto", v);
              }}
              placeholder="0.00"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Peso bruto (kg)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.peso_bruto ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^\d*\.?\d*$/.test(v)) set("peso_bruto", v);
              }}
              placeholder="0.00"
            />
          </div>
          <AutoField label="Preferencia comercial" k="preferencia_comercial" />
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Números de contenedores</Label>
            <AutocompleteInput
              value={form.numeros_contenedores}
              onChange={(v) => set("numeros_contenedores", v)}
              suggestions={sug.numeros_contenedores}
              placeholder="MSKU1234567, TCLU7654321…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Canal de riesgo</Label>
            <Select value={form.canal_riesgo || undefined} onValueChange={(v) => set("canal_riesgo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona canal" /></SelectTrigger>
              <SelectContent>
                {["Verde","Amarillo","Rojo"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
            <Label>Observaciones</Label>
            <Textarea rows={3} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending} className="shadow-lg">
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

function TabTimeline({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const { data: etapas } = useQuery({
    queryKey: ["etapas", expedienteId],
    queryFn: async () => (await supabase.from("etapas").select("*").eq("expediente_id", expedienteId).order("orden")).data ?? [],
  });

  const avanzar = useMutation({
    mutationFn: async ({ etapaId, orden, comentario }: any) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("etapas").update({
        estado: "completada", fecha_cierre: now, comentario,
      }).eq("id", etapaId);
      if (error) throw error;
      // siguiente etapa
      const { data: sig } = await supabase.from("etapas").select("id").eq("expediente_id", expedienteId).eq("orden", orden + 1).maybeSingle();
      if (sig) {
        await supabase.from("etapas").update({ estado: "en_curso", fecha_inicio: now }).eq("id", sig.id);
      }
      await supabase.from("expedientes").update({ etapa_actual: orden + 1 }).eq("id", expedienteId);
      await supabase.from("auditoria").insert({ entidad: "etapas", entidad_id: etapaId, accion: `completada:${orden}` });
    },
    onSuccess: () => {
      toast.success("Etapa completada");
      qc.invalidateQueries({ queryKey: ["etapas", expedienteId] });
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    },
  });

  const iconFor = (estado: string) => {
    if (estado === "completada") return <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />;
    if (estado === "en_curso") return <Clock className="h-5 w-5 text-[var(--warning-foreground)]" />;
    if (estado === "bloqueada") return <XCircle className="h-5 w-5 text-destructive" />;
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Flujo operativo (14 etapas)</CardTitle></CardHeader>
      <CardContent>
        <ol className="relative border-l-2 border-border ml-3 space-y-4">
          {(etapas ?? []).map((et: any) => (
            <li key={et.id} className="pl-6 relative">
              <span className="absolute -left-[13px] top-0 bg-background">{iconFor(et.estado)}</span>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{et.orden}</span>{et.nombre}
                    <Badge variant="outline" className="text-[10px]">{et.estado.replace("_"," ")}</Badge>
                  </div>
                  {et.fecha_inicio && <div className="text-xs text-muted-foreground">Inicio: {new Date(et.fecha_inicio).toLocaleString("es-DO")}</div>}
                  {et.fecha_cierre && <div className="text-xs text-muted-foreground">Cierre: {new Date(et.fecha_cierre).toLocaleString("es-DO")}</div>}
                  {et.comentario && <div className="text-sm mt-1 italic">"{et.comentario}"</div>}
                </div>
                {et.estado === "en_curso" && (
                  <CompletarEtapaDialog etapa={et} onConfirm={(comentario) => avanzar.mutate({ etapaId: et.id, orden: et.orden, comentario })} />
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function CompletarEtapaDialog({ etapa, onConfirm }: { etapa: any; onConfirm: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [comentario, setComentario] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="default">Completar etapa</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Completar: {etapa.nombre}</DialogTitle></DialogHeader>
        <div className="grid gap-2"><Label>Comentario / evidencia</Label><Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => { onConfirm(comentario); setOpen(false); }}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabDocumentos({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState(TIPOS_DOC[0]);
  const [venc, setVenc] = useState("");
  const [obs, setObs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["documentos", expedienteId],
    queryFn: async () => (await supabase.from("documentos").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false })).data ?? [],
  });

  const upload = async () => {
    setUploading(true);
    try {
      let path: string | null = null;
      if (file) {
        path = `${expedienteId}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("documentos").upload(path, file);
        if (error) throw error;
      }
      const { error: e2 } = await supabase.from("documentos").insert({
        expediente_id: expedienteId, tipo, storage_path: path,
        estado: file ? "recibido" : "pendiente",
        fecha_recepcion: file ? new Date().toISOString().slice(0, 10) : null,
        fecha_vencimiento: venc || null, observaciones: obs || null,
      });
      if (e2) throw e2;
      toast.success("Documento agregado");
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      setOpen(false); setFile(null); setVenc(""); setObs("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const cambiarEstado = async (docId: string, estado: string) => {
    await supabase.from("documentos").update({ estado: estado as any }).eq("id", docId);
    qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
  };

  const download = async (path: string) => {
    const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Documentos ({docs?.length ?? 0})</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Upload className="h-4 w-4 mr-1" />Subir documento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo documento</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Archivo</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div className="grid gap-1.5"><Label>Fecha vencimiento</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Observaciones</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={upload} disabled={uploading}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Tipo</th><th className="text-left">Estado</th><th className="text-left">Recepción</th><th className="text-left">Vencimiento</th><th /></tr>
          </thead>
          <tbody>
            {(docs ?? []).map((d: any) => {
              const vencido = d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date();
              return (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium"><FileText className="h-4 w-4 inline mr-1 text-muted-foreground" />{d.tipo}</td>
                  <td>
                    <Select value={d.estado} onValueChange={(v) => cambiarEstado(d.id, v)}>
                      <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["pendiente","recibido","observado","aprobado","vencido"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="text-xs">{d.fecha_recepcion ? new Date(d.fecha_recepcion).toLocaleDateString("es-DO") : "—"}</td>
                  <td className={`text-xs ${vencido ? "text-destructive font-medium" : ""}`}>{d.fecha_vencimiento ? new Date(d.fecha_vencimiento).toLocaleDateString("es-DO") : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {d.storage_path && <Button size="sm" variant="ghost" onClick={() => download(d.storage_path)}>Descargar</Button>}
                  </td>
                </tr>
              );
            })}
            {(!docs || docs.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin documentos.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TabIncidencias({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });

  const { data: incs } = useQuery({
    queryKey: ["incidencias", expedienteId],
    queryFn: async () => (await supabase.from("incidencias").select("*").eq("expediente_id", expedienteId).order("fecha_apertura", { ascending: false })).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("incidencias").insert({ expediente_id: expedienteId, ...f, severidad: f.severidad as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incidencia registrada"); qc.invalidateQueries({ queryKey: ["incidencias", expedienteId] }); setOpen(false); setF({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" }); },
  });

  const resolver = async (incId: string) => {
    await supabase.from("incidencias").update({ estado: "resuelta", fecha_resolucion: new Date().toISOString() }).eq("id", incId);
    qc.invalidateQueries({ queryKey: ["incidencias", expedienteId] });
  };

  const sevColor: Record<string, string> = {
    baja: "bg-muted text-muted-foreground",
    media: "bg-[var(--info)]/15 text-[var(--info)]",
    alta: "bg-[var(--warning)]/25 text-[var(--warning-foreground)]",
    critica: "bg-destructive/15 text-destructive",
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Incidencias</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar incidencia</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_INCIDENCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Severidad</Label>
                <Select value={f.severidad} onValueChange={(v) => setF({ ...f, severidad: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["baja","media","alta","critica"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={add.isPending}>Registrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Tipo</th><th className="text-left">Severidad</th><th className="text-left">Estado</th><th className="text-left">Apertura</th><th /></tr>
          </thead>
          <tbody>
            {(incs ?? []).map((i: any) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">
                  <div>{i.tipo}</div>
                  {i.descripcion && <div className="text-xs text-muted-foreground">{i.descripcion}</div>}
                </td>
                <td><Badge className={`${sevColor[i.severidad]} border-transparent`}>{i.severidad}</Badge></td>
                <td><Badge variant="outline">{i.estado.replace("_"," ")}</Badge></td>
                <td className="text-xs">{new Date(i.fecha_apertura).toLocaleDateString("es-DO")}</td>
                <td className="px-4 py-2 text-right">
                  {i.estado !== "resuelta" && i.estado !== "cerrada" && (
                    <Button size="sm" variant="outline" onClick={() => resolver(i.id)}>Resolver</Button>
                  )}
                </td>
              </tr>
            ))}
            {(!incs || incs.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin incidencias.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TabCostos({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ concepto: CONCEPTOS_COSTO[0], monto_estimado: 0, monto_real: 0 });

  const { data: costos } = useQuery({
    queryKey: ["costos", expedienteId],
    queryFn: async () => (await supabase.from("costos").select("*").eq("expediente_id", expedienteId).order("created_at")).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("costos").insert({ expediente_id: expedienteId, ...f });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Costo registrado"); qc.invalidateQueries({ queryKey: ["costos", expedienteId] }); setOpen(false); setF({ concepto: CONCEPTOS_COSTO[0], monto_estimado: 0, monto_real: 0 }); },
  });

  const totalEst = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_estimado || 0), 0);
  const totalReal = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_real || 0), 0);

  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total estimado</div><div className="text-2xl font-display font-bold mt-1">{fmt(totalEst)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total real</div><div className="text-2xl font-display font-bold mt-1">{fmt(totalReal)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Diferencia</div><div className={`text-2xl font-display font-bold mt-1 ${totalReal - totalEst > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(totalReal - totalEst)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Costos del expediente</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Agregar</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo costo</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label>Concepto</Label>
                  <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONCEPTOS_COSTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Monto estimado (DOP)</Label><Input type="number" step="0.01" value={f.monto_estimado} onChange={(e) => setF({ ...f, monto_estimado: Number(e.target.value) })} /></div>
                  <div className="grid gap-1.5"><Label>Monto real (DOP)</Label><Input type="number" step="0.01" value={f.monto_real} onChange={(e) => setF({ ...f, monto_real: Number(e.target.value) })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => add.mutate()} disabled={add.isPending}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr><th className="text-left px-4 py-2">Concepto</th><th className="text-right">Estimado</th><th className="text-right">Real</th><th className="text-right pr-4">Δ</th></tr>
            </thead>
            <tbody>
              {(costos ?? []).map((c: any) => {
                const diff = Number(c.monto_real) - Number(c.monto_estimado);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{c.concepto}</td>
                    <td className="text-right">{fmt(Number(c.monto_estimado))}</td>
                    <td className="text-right">{fmt(Number(c.monto_real))}</td>
                    <td className={`text-right pr-4 ${diff > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(diff)}</td>
                  </tr>
                );
              })}
              {(!costos || costos.length === 0) && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin costos registrados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function TabAuditoria({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["auditoria", expedienteId],
    queryFn: async () => (await supabase
      .from("auditoria")
      .select("*")
      .or(`entidad_id.eq.${expedienteId}`)
      .order("created_at", { ascending: false })
      .limit(100)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Bitácora</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left">Entidad</th><th className="text-left">Acción</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((a: any) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-4 py-2 text-xs">{new Date(a.created_at).toLocaleString("es-DO")}</td>
                <td className="text-xs text-muted-foreground">{a.entidad}</td>
                <td className="text-xs font-mono">{a.accion}</td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Sin registros aún.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
