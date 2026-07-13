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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, Circle, Clock, XCircle, Upload, Plus, FileText, AlertTriangle, DollarSign, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtLocalDate, parseLocalDate, daysFromToday } from "@/lib/dates";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CatalogCombobox } from "@/components/catalog-combobox";
import { GenerarXmlSigaButton } from "@/components/generar-xml-siga";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { SearchEmailButton } from "@/components/search-email-button";
import { RastrearEmbarqueButton } from "@/components/rastrear-embarque-button";
import { ChecklistHitos } from "@/components/checklist-hitos";

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

const CONCEPTOS_FACTURA = [
  "Honorarios","Transporte","Gestión aduanal","Reembolso de gastos","Servicios adicionales","Otros",
];
const ESTADOS_FACTURA = ["pendiente","cobrada","anulada"];
const CONCEPTOS_GASTO = [
  "Flete","Aranceles","ITBIS","Gastos portuarios","Transporte","Honorarios de terceros","Reembolsos","Otros",
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
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{exp.clientes?.nombre ?? "Sin cliente"}</span>
            {exp.clientes && (
              <>
                <WhatsAppButton
                  phone={exp.clientes.telefono}
                  clientName={exp.clientes.nombre}
                  recordType="Expediente"
                  recordNumber={exp.numero}
                  variant="icon"
                />
                <EmailButton
                  email={(exp.clientes as any).email}
                  clientName={exp.clientes.nombre}
                  recordType="Expediente"
                  recordNumber={exp.numero}
                  variant="icon"
                />
                <SearchEmailButton
                  recordType="Expediente"
                  recordNumber={exp.numero}
                  variant="icon"
                />
              </>
            )}
            <RastrearEmbarqueButton
              containerNumber={exp.numeros_contenedores}
              blNumber={exp.bl_awb}
              expedienteNumber={exp.numero}
            />
            <span>· BL/AWB: {exp.bl_awb ?? "—"}</span>
          </p>
        </div>
        <GenerarXmlSigaButton expedienteId={id} />
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
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="timeline">Flujo / Timeline</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="transportes">Transportes</TabsTrigger>
          <TabsTrigger value="inc">Incidencias</TabsTrigger>
          <TabsTrigger value="cost">Finanzas</TabsTrigger>
          <TabsTrigger value="aud">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="info"><TabInfo exp={exp} /></TabsContent>
        <TabsContent value="checklist"><ChecklistHitos expedienteId={id} /></TabsContent>
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
  const [focusedMoney, setFocusedMoney] = useState<string | null>(null);
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
    numero_certificado_origen: exp.numero_certificado_origen ?? "",
    rectificacion_tecnica: !!exp.rectificacion_tecnica,
    numero_tramite_rectificacion: exp.numero_tramite_rectificacion ?? "",
    canal_riesgo: exp.canal_riesgo ?? "",
    total_fob: exp.total_fob ?? "",
    seguro: exp.seguro ?? "",
    flete: exp.flete ?? "",
    otros: exp.otros ?? "",
    regimen_aduanero: exp.regimen_aduanero ?? "",
    observaciones: exp.observaciones ?? "",
    pais_origen_codigo: exp.pais_origen_codigo ?? "",
    pais_procedencia_codigo: exp.pais_procedencia_codigo ?? "",
    puerto_arribo_codigo: exp.puerto_arribo_codigo ?? "",
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

  const { data: mercItems } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null).order("item_no")).data ?? [],
  });
  const sumFob = useMemo(
    () => (mercItems ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0),
    [mercItems],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      payload.peso_neto = payload.peso_neto === "" ? null : Number(payload.peso_neto);
      payload.peso_bruto = payload.peso_bruto === "" ? null : Number(payload.peso_bruto);
      const toNum = (v: any) => (v === "" || v == null ? null : Number(v));
      payload.total_fob = sumFob || 0;
      payload.seguro = toNum(payload.seguro);
      payload.flete = toNum(payload.flete);
      payload.otros = toNum(payload.otros);
      payload.total_cif = (payload.total_fob ?? 0) + (payload.seguro ?? 0) + (payload.flete ?? 0) + (payload.otros ?? 0);
      if (!payload.regimen_aduanero) payload.regimen_aduanero = null;
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
        <div className="grid gap-1.5">
          <Label>País de origen</Label>
          <CatalogCombobox
            table="catalogo_paises"
            value={form.pais_origen}
            codigo={form.pais_origen_codigo}
            onChange={(nombre, codigo) => setForm((f) => ({ ...f, pais_origen: nombre, pais_origen_codigo: codigo }))}
            placeholder="Selecciona país (catálogo DGA)"
          />
        </div>
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
          <div className="grid gap-1.5">
            <Label>Puerto de arribo</Label>
            <CatalogCombobox
              table="catalogo_puertos"
              value={form.puerto_arribo}
              codigo={form.puerto_arribo_codigo}
              onChange={(nombre, codigo) => setForm((f) => ({ ...f, puerto_arribo: nombre, puerto_arribo_codigo: codigo }))}
              placeholder="Buscar puerto (catálogo DGA)"
            />
          </div>
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
          {(() => {
            const p = (form.preferencia_comercial || "").trim().toLowerCase();
            const showCert = p !== "" && p !== "ninguna" && p !== "no aplica" && p !== "n/a";
            return showCert ? (
              <div className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label>N° Certificado de Origen</Label>
                <Input
                  value={form.numero_certificado_origen}
                  onChange={(e) => set("numero_certificado_origen", e.target.value)}
                  placeholder="CO-2026-00123"
                />
              </div>
            ) : null;
          })()}
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
            <Label>Rectificación técnica</Label>
            <div className="h-9 flex items-center gap-3">
              <Switch
                checked={form.rectificacion_tecnica}
                onCheckedChange={(v) => set("rectificacion_tecnica", v)}
              />
              <span className="text-sm text-muted-foreground">
                {form.rectificacion_tecnica ? "Sí" : "No"}
              </span>
            </div>
          </div>
          {form.rectificacion_tecnica && (
            <div className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label>N° de Trámite</Label>
              <Input
                value={form.numero_tramite_rectificacion}
                onChange={(e) => set("numero_tramite_rectificacion", e.target.value)}
                placeholder="RT-2026-0456"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Canal de riesgo</Label>
            <Select value={form.canal_riesgo || undefined} onValueChange={(v) => set("canal_riesgo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona canal" /></SelectTrigger>
              <SelectContent>
                {["Verde","Amarillo","Rojo"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <MercanciaItemsBlock expedienteId={exp.id} />
          </div>
          {(() => {
            const toN = (v: any) => (v === "" || v == null ? 0 : Number(v) || 0);
            const fob = sumFob;
            const cif = fob + toN(form.seguro) + toN(form.flete) + toN(form.otros);
            const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const renderMoney = (label: string, k: "seguro" | "flete" | "otros") => {
              const raw = (form as any)[k];
              const rawStr = raw === "" || raw == null ? "" : String(raw);
              const isFocused = focusedMoney === k;
              const display = isFocused
                ? rawStr
                : rawStr === "" || isNaN(Number(rawStr))
                  ? ""
                  : `$${Number(rawStr).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div className="grid gap-1.5" key={k}>
                  <Label>{label} (US$)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={display}
                    onFocus={() => setFocusedMoney(k)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[$,\s]/g, "");
                      if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set(k, v);
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/[$,\s]/g, "");
                      if (v !== "" && !isNaN(Number(v))) set(k, Number(v).toFixed(2));
                      setFocusedMoney(null);
                    }}
                    placeholder="$0.00"
                    className="tabular-nums"
                  />
                </div>
              );
            };



            const REGIMENES = [
              "Admisión Temporal",
              "Admisión Temporal sin Transformación",
              "Depósito de Reexportación",
              "Depósito Fiscal",
              "Depósito Logístico",
              "Depósito Particular",
              "Despacho a Consumo",
              "Reimportación",
              "Zona Franca Comercial",
              "Zonas Francas Industrial y Especiales",
            ];
            return (
              <div className="md:col-span-2 lg:col-span-3 grid gap-4 pt-2 border-t">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Valores CIF</div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      Total FOB (US$)
                      <span className="text-xs text-muted-foreground font-normal">🔒 calculado</span>
                    </Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                      {fmt(fob)}
                    </div>
                  </div>
                  {renderMoney("Seguro", "seguro")}
                  {renderMoney("Flete", "flete")}
                  {renderMoney("Otros", "otros")}

                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      Total CIF (US$)
                      <span className="text-xs text-muted-foreground font-normal">🔒 calculado</span>
                    </Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                      {fmt(cif)}
                    </div>
                  </div>
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>Régimen Aduanero</Label>
                    <Select value={form.regimen_aduanero || undefined} onValueChange={(v) => set("regimen_aduanero", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona régimen" /></SelectTrigger>
                      <SelectContent>
                        {REGIMENES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })()}

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
              const vd = daysFromToday(d.fecha_vencimiento); const vencido = d.fecha_vencimiento && !isNaN(vd) && vd < 0;
              return (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium"><FileText className="h-4 w-4 inline mr-1 text-muted-foreground" />{d.tipo}</td>
                  <td>
                    <Select value={d.estado} onValueChange={(v) => cambiarEstado(d.id, v)}>
                      <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["pendiente","recibido","observado","aprobado","vencido"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="text-xs">{fmtLocalDate(d.fecha_recepcion)}</td>
                  <td className={`text-xs ${vencido ? "text-destructive font-medium" : ""}`}>{fmtLocalDate(d.fecha_vencimiento)}</td>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { concepto: CONCEPTOS_COSTO[0], monto_estimado: 0, monto_real: 0 };
  const [f, setF] = useState<{ concepto: string; monto_estimado: number; monto_real: number }>(emptyForm);

  const { data: costos } = useQuery({
    queryKey: ["costos", expedienteId],
    queryFn: async () => (await supabase.from("costos").select("*").eq("expediente_id", expedienteId).order("created_at")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from("costos").update({ concepto: f.concepto, monto_estimado: f.monto_estimado, monto_real: f.monto_real }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("costos").insert({ expediente_id: expedienteId, ...f });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Costo actualizado" : "Costo registrado");
      qc.invalidateQueries({ queryKey: ["costos", expedienteId] });
      setOpen(false);
      setEditingId(null);
      setF(emptyForm);
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("costos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Costo eliminado"); qc.invalidateQueries({ queryKey: ["costos", expedienteId] }); },
  });

  const openNew = () => { setEditingId(null); setF(emptyForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditingId(c.id);
    setF({ concepto: c.concepto, monto_estimado: Number(c.monto_estimado ?? 0), monto_real: Number(c.monto_real ?? 0) });
    setOpen(true);
  };

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
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar costo" : "Nuevo costo"}</DialogTitle></DialogHeader>
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
              <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr><th className="text-left px-4 py-2">Concepto</th><th className="text-right">Estimado</th><th className="text-right">Real</th><th className="text-right">Δ</th><th className="text-right pr-4 w-24">Acciones</th></tr>
            </thead>
            <tbody>
              {(costos ?? []).map((c: any) => {
                const diff = Number(c.monto_real) - Number(c.monto_estimado);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{c.concepto}</td>
                    <td className="text-right">{fmt(Number(c.monto_estimado))}</td>
                    <td className="text-right">{fmt(Number(c.monto_real))}</td>
                    <td className={`text-right ${diff > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(diff)}</td>
                    <td className="text-right pr-4">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Eliminar este costo?")) del.mutate(c.id); }} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!costos || costos.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin costos registrados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <LiquidacionSection expedienteId={expedienteId} />
    </div>
  );
}

function fmtDOP(n: number) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
}

function LiquidacionSection({ expedienteId }: { expedienteId: string }) {
  const { data: facturas } = useQuery({
    queryKey: ["facturas", expedienteId],
    queryFn: async () => (await supabase.from("facturas").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("created_at")).data ?? [],
  });
  const { data: gastos } = useQuery({
    queryKey: ["gastos", expedienteId],
    queryFn: async () => (await supabase.from("gastos").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("created_at")).data ?? [],
  });

  const totalFact = (facturas ?? []).reduce((s: number, f: any) => s + Number(f.monto || 0), 0);
  const totalGastos = (gastos ?? []).reduce((s: number, g: any) => s + (g.es_reembolso ? -Number(g.monto || 0) : Number(g.monto || 0)), 0);
  const utilidad = totalFact - totalGastos;
  const margen = totalFact > 0 ? (utilidad / totalFact) * 100 : 0;

  const marginColor = margen < 0 ? "text-destructive" : margen < 15 ? "text-amber-600" : "text-[var(--success)]";

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-lg">Liquidación del expediente</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total facturado</div><div className="text-xl font-display font-bold mt-1">{fmtDOP(totalFact)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total gastos</div><div className="text-xl font-display font-bold mt-1">{fmtDOP(totalGastos)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Utilidad</div><div className={`text-xl font-display font-bold mt-1 ${marginColor}`}>{fmtDOP(utilidad)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Margen</div><div className={`text-xl font-display font-bold mt-1 ${marginColor}`}>{margen.toFixed(1)}%</div></CardContent></Card>
      </div>

      <FacturasBlock expedienteId={expedienteId} facturas={facturas ?? []} />
      <GastosBlock expedienteId={expedienteId} gastos={gastos ?? []} />
    </div>
  );
}

function FacturasBlock({ expedienteId, facturas }: { expedienteId: string; facturas: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = { concepto: CONCEPTOS_FACTURA[0], monto: 0, fecha_emision: "", fecha_pago: "", estado: "pendiente", referencia: "", notas: "" };
  const [f, setF] = useState<any>(empty);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        concepto: f.concepto, monto: Number(f.monto || 0),
        fecha_emision: f.fecha_emision || null, fecha_pago: f.fecha_pago || null,
        estado: f.estado, referencia: f.referencia || null, notas: f.notas || null,
      };
      if (editingId) {
        const { error } = await supabase.from("facturas").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("facturas").insert({ expediente_id: expedienteId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Factura actualizada" : "Factura registrada");
      qc.invalidateQueries({ queryKey: ["facturas", expedienteId] });
      setOpen(false); setEditingId(null); setF(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("facturas").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviada a papelera"); qc.invalidateQueries({ queryKey: ["facturas", expedienteId] }); },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setF({ concepto: r.concepto, monto: Number(r.monto || 0), fecha_emision: r.fecha_emision ?? "", fecha_pago: r.fecha_pago ?? "", estado: r.estado ?? "pendiente", referencia: r.referencia ?? "", notas: r.notas ?? "" });
    setOpen(true);
  };
  const openNew = () => { setEditingId(null); setF(empty); setOpen(true); };

  const subtotal = facturas.reduce((s, r) => s + Number(r.monto || 0), 0);
  const estadoBadge = (e: string) => e === "cobrada" ? "bg-[var(--success)]/15 text-[var(--success)]" : e === "anulada" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Facturación (cobros)</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(empty); } }}>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar factura</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar factura" : "Nueva factura"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Concepto</Label>
                <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONCEPTOS_FACTURA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto (DOP)</Label><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Estado</Label>
                  <Select value={f.estado} onValueChange={(v) => setF({ ...f, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS_FACTURA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Fecha emisión</Label><Input type="date" value={f.fecha_emision} onChange={(e) => setF({ ...f, fecha_emision: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Fecha pago</Label><Input type="date" value={f.fecha_pago} onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Referencia / N° factura</Label><Input value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left">Referencia</th>
              <th className="text-left">Emisión</th>
              <th className="text-left">Pago</th>
              <th className="text-left">Estado</th>
              <th className="text-right">Monto</th>
              <th className="text-right pr-4 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2">{r.concepto}</td>
                <td className="text-xs text-muted-foreground">{r.referencia || "—"}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha_emision)}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha_pago)}</td>
                <td><Badge variant="outline" className={estadoBadge(r.estado)}>{r.estado}</Badge></td>
                <td className="text-right font-medium">{fmtDOP(Number(r.monto))}</td>
                <td className="text-right pr-4">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Enviar esta factura a la papelera?")) softDel.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {facturas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Sin facturas registradas.</td></tr>}
            {facturas.length > 0 && (
              <tr className="bg-muted/20 font-medium">
                <td colSpan={5} className="px-4 py-2 text-right">Subtotal</td>
                <td className="text-right">{fmtDOP(subtotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GastosBlock({ expedienteId, gastos }: { expedienteId: string; gastos: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = { concepto: CONCEPTOS_GASTO[0], monto: 0, fecha: "", proveedor: "", es_reembolso: false, notas: "" };
  const [f, setF] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let adjunto_path: string | null | undefined = undefined;
      if (file) {
        const path = `expedientes/${expedienteId}/gastos/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
        if (upErr) throw upErr;
        adjunto_path = path;
      }
      const payload: any = {
        concepto: f.concepto, monto: Number(f.monto || 0),
        fecha: f.fecha || null, proveedor: f.proveedor || null,
        es_reembolso: !!f.es_reembolso, notas: f.notas || null,
      };
      if (adjunto_path !== undefined) payload.adjunto_path = adjunto_path;
      if (editingId) {
        const { error } = await supabase.from("gastos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gastos").insert({ expediente_id: expedienteId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Gasto actualizado" : "Gasto registrado");
      qc.invalidateQueries({ queryKey: ["gastos", expedienteId] });
      setOpen(false); setEditingId(null); setF(empty); setFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gastos").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviado a papelera"); qc.invalidateQueries({ queryKey: ["gastos", expedienteId] }); },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setF({ concepto: r.concepto, monto: Number(r.monto || 0), fecha: r.fecha ?? "", proveedor: r.proveedor ?? "", es_reembolso: !!r.es_reembolso, notas: r.notas ?? "" });
    setFile(null);
    setOpen(true);
  };
  const openNew = () => { setEditingId(null); setF(empty); setFile(null); setOpen(true); };

  const subtotal = gastos.reduce((s, r) => s + (r.es_reembolso ? -Number(r.monto || 0) : Number(r.monto || 0)), 0);

  const openAdjunto = async (path: string) => {
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Gastos operativos</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(empty); setFile(null); } }}>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar gasto</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar gasto" : "Nuevo gasto"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Concepto</Label>
                <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v, es_reembolso: v === "Reembolsos" ? true : f.es_reembolso })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONCEPTOS_GASTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto (DOP)</Label><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Proveedor</Label><Input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.es_reembolso} onChange={(e) => setF({ ...f, es_reembolso: e.target.checked })} />
                Es reembolso (resta del total)
              </label>
              <div className="grid gap-1.5"><Label>Adjunto</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left">Proveedor</th>
              <th className="text-left">Fecha</th>
              <th className="text-left">Adjunto</th>
              <th className="text-right">Monto</th>
              <th className="text-right pr-4 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2">{r.concepto}{r.es_reembolso && <Badge variant="outline" className="ml-2 text-xs">reembolso</Badge>}</td>
                <td className="text-xs text-muted-foreground">{r.proveedor || "—"}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha)}</td>
                <td>{r.adjunto_path ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openAdjunto(r.adjunto_path)}><FileText className="h-3.5 w-3.5 mr-1" />Ver</Button> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className={`text-right font-medium ${r.es_reembolso ? "text-[var(--success)]" : ""}`}>{r.es_reembolso ? "−" : ""}{fmtDOP(Number(r.monto))}</td>
                <td className="text-right pr-4">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Enviar este gasto a la papelera?")) softDel.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin gastos registrados.</td></tr>}
            {gastos.length > 0 && (
              <tr className="bg-muted/20 font-medium">
                <td colSpan={4} className="px-4 py-2 text-right">Subtotal (neto)</td>
                <td className="text-right">{fmtDOP(subtotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
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

function TabPermisosExp({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["permisos-por-expediente", expedienteId],
    queryFn: async () => (await supabase.from("permisos").select("*").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false })).data ?? [],
  });
  const TIPOS: Record<string, string> = { sanitario:"Sanitario", fitosanitario:"Fitosanitario", zoosanitario:"Zoosanitario", indocal:"INDOCAL", ambiental:"Ambiental", agricola:"Agrícola", ministerio_salud:"Ministerio de Salud", otro:"Otro" };
  const ESTADOS: Record<string, string> = { solicitado:"Solicitado", en_tramite:"En trámite", aprobado:"Aprobado", rechazado:"Rechazado", vencido:"Vencido" };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Permisos vinculados ({data?.length ?? 0})</CardTitle>
        <Button asChild size="sm"><Link to="/permisos/nuevo" search={{ expediente: expedienteId }}><Plus className="h-4 w-4 mr-1" /> Agregar Permiso</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {(!data || data.length === 0) ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin permisos vinculados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2">N° Permiso</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Institución</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Emisión</th>
                <th className="text-left">Vence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/permisos/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.numero}</Link>
                  </td>
                  <td className="text-muted-foreground">{TIPOS[p.tipo] ?? "—"}</td>
                  <td className="text-muted-foreground">{p.institucion_emisora ?? "—"}</td>
                  <td><Badge variant="outline">{ESTADOS[p.estado] ?? p.estado}</Badge></td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(p.fecha_emision)}</td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(p.fecha_vencimiento)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild><Link to="/permisos/$id" params={{ id: p.id }}>Editar</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TabTransportesExp({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["transportes-por-expediente", expedienteId],
    queryFn: async () => (await supabase.from("transportes").select("*").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false })).data ?? [],
  });
  const TIPOS: Record<string, string> = { maritimo:"Marítimo", aereo:"Aéreo", terrestre:"Terrestre" };
  const ESTADOS: Record<string, string> = { programado:"Programado", en_transito:"En tránsito", entregado:"Entregado", retrasado:"Retrasado" };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Transportes vinculados ({data?.length ?? 0})</CardTitle>
        <Button asChild size="sm"><Link to="/transportes/nuevo" search={{ expediente: expedienteId }}><Plus className="h-4 w-4 mr-1" /> Agregar Transporte</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {(!data || data.length === 0) ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin transportes vinculados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2">N° Viaje</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Transportista</th>
                <th className="text-left">Placa / Ctn</th>
                <th className="text-left">Salida</th>
                <th className="text-left">ETA</th>
                <th className="text-left">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/transportes/$id" params={{ id: t.id }} className="text-primary hover:underline">{t.numero_viaje}</Link>
                  </td>
                  <td className="text-muted-foreground">{TIPOS[t.tipo] ?? "—"}</td>
                  <td>{t.transportista ?? "—"}</td>
                  <td className="text-xs text-muted-foreground tabular-nums">{t.placa_contenedor ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(t.fecha_salida)}</td>
                  <td className="text-xs">{fmtLocalDate(t.eta)}</td>
                  <td><Badge variant="outline">{ESTADOS[t.estado] ?? t.estado}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild><Link to="/transportes/$id" params={{ id: t.id }}>Editar</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const UNIDADES_MEDIDA = ["Kilogramos", "Unidades", "Litros", "Toneladas", "Metros", "Cajas", "Sacos", "Otros"];

function MercanciaItemsBlock({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", expedienteId],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { codigo_arancelario: "", detalle_producto: "", unidad_medida: "", unidad_codigo: "", cantidad: "", peso: "", valor_fob: "" };
  const [f, setF] = useState(emptyForm);

  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mercancia-items", expedienteId] });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const payload: any = {
        codigo_arancelario: f.codigo_arancelario || null,
        detalle_producto: f.detalle_producto || null,
        unidad_medida: f.unidad_medida || null,
        unidad_codigo: f.unidad_codigo || null,
        cantidad: f.cantidad === "" ? 0 : Number(f.cantidad),
        peso: f.peso === "" ? 0 : Number(f.peso),
        valor_fob: f.valor_fob === "" ? 0 : Number(f.valor_fob),
      };
      if (editingId) {
        const { error } = await supabase.from("mercancia_items").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const nextNo = ((items ?? []).reduce((m: number, it: any) => Math.max(m, it.item_no || 0), 0)) + 1;
        const { error } = await supabase.from("mercancia_items").insert({ ...payload, expediente_id: expedienteId, item_no: nextNo });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editingId ? "Ítem actualizado" : "Ítem agregado"); setOpen(false); setEditingId(null); setF(emptyForm); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("mercancia_items").update({ deleted_at: new Date().toISOString(), deleted_by: userRes.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ítem movido a papelera"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const startNew = () => { setEditingId(null); setF(emptyForm); setOpen(true); };
  const startEdit = (it: any) => {
    setEditingId(it.id);
    setF({
      codigo_arancelario: it.codigo_arancelario ?? "",
      detalle_producto: it.detalle_producto ?? "",
      unidad_medida: it.unidad_medida ?? "",
      unidad_codigo: it.unidad_codigo ?? "",
      cantidad: it.cantidad != null ? String(it.cantidad) : "",
      peso: it.peso != null ? String(it.peso) : "",
      valor_fob: it.valor_fob != null ? String(it.valor_fob) : "",
    });
    setOpen(true);
  };

  return (
    <div className="grid gap-3 pt-2 border-t">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle de mercancía</div>
        <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-4 w-4 mr-1" />Agregar ítem</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left w-12">#</th>
              <th className="px-3 py-2 text-left">Cód. Arancel</th>
              <th className="px-3 py-2 text-left">Detalle Producto</th>
              <th className="px-3 py-2 text-left">Unidad</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Peso</th>
              <th className="px-3 py-2 text-right">Valor FOB (US$)</th>
              <th className="px-3 py-2 text-right w-24"></th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">Sin ítems. Agrega el primero.</td></tr>
            ) : (items ?? []).map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{it.item_no}</td>
                <td className="px-3 py-2 tabular-nums">{it.codigo_arancelario || "—"}</td>
                <td className="px-3 py-2">{it.detalle_producto || "—"}</td>
                <td className="px-3 py-2">{it.unidad_medida || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(it.cantidad || 0).toLocaleString("en-US")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(it.peso || 0).toLocaleString("en-US")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(it.valor_fob || 0))}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminar.mutate(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
          {(items ?? []).length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suma FOB</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">US$ {fmt(totalFob)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Editar ítem" : "Nuevo ítem"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Código Arancelario</Label>
              <Input value={f.codigo_arancelario} onChange={(e) => setF({ ...f, codigo_arancelario: e.target.value })} placeholder="0402.10.90" />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidad de Medida</Label>
              <CatalogCombobox
                table="catalogo_unidades"
                value={f.unidad_medida}
                codigo={f.unidad_codigo}
                onChange={(nombre, codigo) => setF({ ...f, unidad_medida: nombre, unidad_codigo: codigo })}
                placeholder="Selecciona unidad (catálogo DGA)"
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Detalle del Producto</Label>
              <Textarea rows={2} value={f.detalle_producto} onChange={(e) => setF({ ...f, detalle_producto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cantidad</Label>
              <Input type="text" inputMode="decimal" value={f.cantidad} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, cantidad: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Peso</Label>
              <Input type="text" inputMode="decimal" value={f.peso} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, peso: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor FOB (US$)</Label>
              <Input type="text" inputMode="decimal" value={f.valor_fob}
                onChange={(e) => { const v = e.target.value.replace(/,/g, ""); if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setF({ ...f, valor_fob: v }); }}
                onBlur={(e) => { const v = e.target.value; if (v !== "" && !isNaN(Number(v))) setF({ ...f, valor_fob: Number(v).toFixed(2) }); }}
                placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : (editingId ? "Actualizar" : "Agregar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


