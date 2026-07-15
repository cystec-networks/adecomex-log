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
import { ArrowLeft, CheckCircle2, Circle, Clock, XCircle, Upload, Plus, FileText, AlertTriangle, DollarSign, Pencil, Trash2, ExternalLink, Search, Scale, ShieldCheck, LayoutGrid, FileCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtLocalDate, parseLocalDate, daysFromToday } from "@/lib/dates";
import { useTasaCambioForExpediente, debeCongelar } from "@/lib/tasa-cambio";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CatalogCombobox } from "@/components/catalog-combobox";
import { GenerarXmlSigaButton } from "@/components/generar-xml-siga";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { SearchEmailButton } from "@/components/search-email-button";
import { RastrearEmbarqueButton } from "@/components/rastrear-embarque-button";
import { ChecklistHitos } from "@/components/checklist-hitos";
import { FacturaEcfSelector } from "@/components/factura-ecf-selector";
import { EscanearFacturaButton } from "@/components/escanear-factura-button";
import { TIPOS_BIENES_SERVICIOS, TIPOS_RETENCION_ISR } from "@/lib/fiscal-606";
import { ESTADO_LABEL } from "@/lib/estados-expediente";
import { useMyRoles } from "@/lib/auth-hooks";

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
      if (estado === "despachado" && !(exp as any)?.factura_ecf_id) {
        throw new Error("Para cambiar a Despachado debes vincular una Factura e-CF real (pestaña Finanzas).");
      }
      const { error } = await supabase.from("expedientes").update({ estado: estado as any }).eq("id", id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: id, accion: `cambio_estado:${estado}` });
    },
    onSuccess: () => { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["expediente", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!exp) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/expedientes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {exp.numero}
            <Badge className="bg-primary/10 text-primary border-transparent">{ESTADO_LABEL[exp.estado ?? ""] ?? exp.estado?.replace("_"," ")}</Badge>
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
            {["digitar","presentar","verificar","facturar","despachado"].map((e) => <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>)}
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
    liq_siga_numero: exp.liq_siga_numero ?? "",
    liq_siga_estado: exp.liq_siga_estado ?? "",
    liq_oficial_total: exp.liq_oficial_total ?? "",
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
      payload.liq_oficial_total = toNum(payload.liq_oficial_total);
      if (!payload.liq_siga_numero) payload.liq_siga_numero = null;
      if (!payload.liq_siga_estado) payload.liq_siga_estado = null;
      if (!payload.regimen_aduanero) payload.regimen_aduanero = null;
      // Congelar la tasa cuando el expediente pasa a despachado o registra resultado oficial DGA.
      if (debeCongelar({ estado: exp.estado, liq_oficial_total: payload.liq_oficial_total, tasa_cambio_congelada: exp.tasa_cambio_congelada })) {
        payload.tasa_cambio_congelada = true;
        if (exp.tasa_cambio_usada != null) payload.tasa_cambio_usada = Number(exp.tasa_cambio_usada);
      }
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
            <MercanciaItemsBlock
              expedienteId={exp.id}
              seguro={Number(form.seguro) || 0}
              flete={Number(form.flete) || 0}
              otros={Number(form.otros) || 0}
              preferenciaComercial={form.preferencia_comercial || ""}
            />
          </div>
          <HerramientasDgaVuce />
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

          <div className="md:col-span-2 lg:col-span-3">
            <LiquidacionEstimadaBlock
              exp={exp}
              seguro={Number(form.seguro) || 0}
              flete={Number(form.flete) || 0}
              otros={Number(form.otros) || 0}
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <ResultadoOficialBlock
              exp={exp}
              form={form}
              set={set}
            />
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

function RentabilidadCard({ expedienteId }: { expedienteId: string }) {
  const { data: roles } = useMyRoles();
  const allowed = (roles ?? []).some((r) => r === "admin" || r === "finanzas");
  const { data } = useQuery({
    queryKey: ["rentabilidad", expedienteId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_rentabilidad_expediente" as any)
        .select("total_facturado,total_costos_reales,total_gastos,margen_real,margen_pct")
        .eq("expediente_id", expedienteId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  if (!allowed) return null;
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
  const fact = Number(data?.total_facturado ?? 0);
  const costos = Number(data?.total_costos_reales ?? 0);
  const gastos = Number(data?.total_gastos ?? 0);
  const margen = Number(data?.margen_real ?? 0);
  const pct = data?.margen_pct == null ? null : Number(data.margen_pct);
  const tone = margen < 0 ? "text-destructive" : pct != null && pct < 15 ? "text-amber-600" : "text-[var(--success)]";
  return (
    <Card className={margen < 0 ? "border-destructive/40" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />Rentabilidad
          {margen < 0 && <Badge variant="destructive" className="ml-2">Margen negativo</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Total facturado</div><div className="text-xl font-display font-bold mt-1">{fmt(fact)}</div></div>
        <div><div className="text-xs text-muted-foreground">Costos reales</div><div className="text-xl font-display font-bold mt-1">{fmt(costos)}</div></div>
        <div><div className="text-xs text-muted-foreground">Gastos</div><div className="text-xl font-display font-bold mt-1">{fmt(gastos)}</div></div>
        <div>
          <div className="text-xs text-muted-foreground">Margen real</div>
          <div className={`text-xl font-display font-bold mt-1 ${tone}`}>{fmt(margen)}</div>
          <div className={`text-xs mt-0.5 ${tone}`}>{pct == null ? "— sin facturación" : `${pct.toFixed(1)}%`}</div>
        </div>
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
      <RentabilidadCard expedienteId={expedienteId} />

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

      <FacturaEcfBlock expedienteId={expedienteId} totalFact={totalFact} />
      <FacturasBlock expedienteId={expedienteId} facturas={facturas ?? []} />
      <GastosBlock expedienteId={expedienteId} gastos={gastos ?? []} />
    </div>
  );
}

function FacturaEcfBlock({ expedienteId, totalFact }: { expedienteId: string; totalFact: number }) {
  const qc = useQueryClient();
  const { data: exp } = useQuery({
    queryKey: ["expediente", expedienteId],
    queryFn: async () => (await supabase.from("expedientes").select("*").eq("id", expedienteId).maybeSingle()).data,
  });
  const link = useMutation({
    mutationFn: async (fid: string | null) => {
      const { error } = await supabase.from("expedientes").update({ factura_ecf_id: fid }).eq("id", expedienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura e-CF actualizada");
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">
          Factura e-CF (DGII) — requerida para Despachar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FacturaEcfSelector
          value={(exp as any)?.factura_ecf_id ?? null}
          onChange={(id: string | null) => link.mutate(id)}
          preload={{
            cliente_id: (exp as any)?.cliente_id ?? null,
            monto_total: totalFact,
          }}
        />
        {!(exp as any)?.factura_ecf_id && (
          <p className="text-xs text-amber-700 mt-2">
            Sin factura vinculada: el expediente no podrá pasar a estado "Despachado".
          </p>
        )}
      </CardContent>
    </Card>
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
  const empty = {
    concepto: CONCEPTOS_GASTO[0], monto: 0, fecha: "", proveedor: "", es_reembolso: false, notas: "",
    rnc_cedula_proveedor: "", tipo_id_proveedor: "", ncf_proveedor: "", tipo_ncf_proveedor: "",
    ncf_modificado: "", monto_facturado: 0, itbis_facturado: 0, itbis_retenido: 0, isr_retenido: 0,
    forma_pago: "",
    tipo_bienes_servicios: "" as string,
    monto_facturado_servicios: 0, monto_facturado_bienes: 0,
    tipo_retencion_isr: "" as string,
    itbis_proporcionalidad_349: 0, itbis_llevado_costo: 0,
    itbis_percibido_compras: 0, isr_percibido_compras: 0,
    impuesto_selectivo_consumo: 0, otros_impuestos_tasas: 0, monto_propina_legal: 0,
  };
  const [f, setF] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [crearCxp, setCrearCxp] = useState(false);
  const [cxpVence, setCxpVence] = useState<string>("");


  const save = useMutation({
    mutationFn: async () => {
      let adjunto_path: string | null | undefined = undefined;
      if (file) {
        const path = `expedientes/${expedienteId}/gastos/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
        if (upErr) throw upErr;
        adjunto_path = path;
      }
      // Validaciones opcionales de formato
      const rnc = (f.rnc_cedula_proveedor || "").trim();
      if (rnc && !/^\d{9}$|^\d{11}$/.test(rnc)) throw new Error("RNC/Cédula debe tener 9 u 11 dígitos numéricos");
      const ncf = (f.ncf_proveedor || "").trim().toUpperCase();
      if (ncf && !/^[A-Z0-9]{11}$|^[A-Z0-9]{13}$/.test(ncf)) throw new Error("NCF debe tener 11 o 13 caracteres alfanuméricos");
      const ncfMod = (f.ncf_modificado || "").trim().toUpperCase();
      if (ncfMod && !/^[A-Z0-9]{11}$|^[A-Z0-9]{13}$/.test(ncfMod)) throw new Error("NCF modificado debe tener 11 o 13 caracteres alfanuméricos");

      const mfServ = Number(f.monto_facturado_servicios || 0);
      const mfBien = Number(f.monto_facturado_bienes || 0);
      const payload: any = {
        concepto: f.concepto, monto: Number(f.monto || 0),
        fecha: f.fecha || null, proveedor: f.proveedor || null,
        es_reembolso: !!f.es_reembolso, notas: f.notas || null,
        rnc_cedula_proveedor: rnc || null,
        tipo_id_proveedor: f.tipo_id_proveedor || null,
        ncf_proveedor: ncf || null,
        tipo_ncf_proveedor: f.tipo_ncf_proveedor || null,
        ncf_modificado: ncfMod || null,
        monto_facturado: mfServ + mfBien,
        monto_facturado_servicios: mfServ,
        monto_facturado_bienes: mfBien,
        itbis_facturado: Number(f.itbis_facturado || 0),
        itbis_retenido: Number(f.itbis_retenido || 0),
        isr_retenido: Number(f.isr_retenido || 0),
        forma_pago: f.forma_pago || null,
        tipo_bienes_servicios: f.tipo_bienes_servicios ? Number(f.tipo_bienes_servicios) : null,
        tipo_retencion_isr: f.tipo_retencion_isr ? Number(f.tipo_retencion_isr) : null,
        itbis_proporcionalidad_349: Number(f.itbis_proporcionalidad_349 || 0),
        itbis_llevado_costo: Number(f.itbis_llevado_costo || 0),
        itbis_percibido_compras: Number(f.itbis_percibido_compras || 0),
        isr_percibido_compras: Number(f.isr_percibido_compras || 0),
        impuesto_selectivo_consumo: Number(f.impuesto_selectivo_consumo || 0),
        otros_impuestos_tasas: Number(f.otros_impuestos_tasas || 0),
        monto_propina_legal: Number(f.monto_propina_legal || 0),
      };
      if (adjunto_path !== undefined) payload.adjunto_path = adjunto_path;

      let gastoId = editingId;
      if (editingId) {
        const { error } = await supabase.from("gastos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("gastos").insert({ expediente_id: expedienteId, ...payload }).select("id").single();
        if (error) throw error;
        gastoId = ins.id;
      }

      let cxpCreada = false;
      if (crearCxp) {
        const proveedorNombre = (f.proveedor || "").trim() || (rnc || "").trim() || (f.concepto || "").trim();
        const montoCxp = (payload.monto_facturado && payload.monto_facturado > 0) ? payload.monto_facturado : Number(f.monto || 0);
        const { data: u } = await supabase.auth.getUser();
        const { error: cxpErr } = await supabase.from("cuentas_por_pagar").insert({
          gasto_id: gastoId,
          expediente_id: expedienteId,
          proveedor_nombre: proveedorNombre,
          proveedor_rnc: rnc || null,
          monto_total: montoCxp,
          moneda: "DOP",
          fecha_factura: f.fecha || null,
          fecha_vencimiento: cxpVence || null,
          estado: "pendiente",
          notas: "Generado automáticamente desde gasto",
          created_by: u.user?.id,
        });
        if (cxpErr) throw new Error(`Gasto guardado, pero falló la cuenta por pagar: ${cxpErr.message}`);
        cxpCreada = true;
      }
      return { cxpCreada };
    },
    onSuccess: (r) => {
      toast.success(
        r?.cxpCreada
          ? (editingId ? "Gasto actualizado y cuenta por pagar creada" : "Gasto registrado y cuenta por pagar creada")
          : (editingId ? "Gasto actualizado" : "Gasto registrado")
      );
      qc.invalidateQueries({ queryKey: ["gastos", expedienteId] });
      setOpen(false); setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence("");
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
    setF({
      concepto: r.concepto, monto: Number(r.monto || 0), fecha: r.fecha ?? "",
      proveedor: r.proveedor ?? "", es_reembolso: !!r.es_reembolso, notas: r.notas ?? "",
      rnc_cedula_proveedor: r.rnc_cedula_proveedor ?? "",
      tipo_id_proveedor: r.tipo_id_proveedor ?? "",
      ncf_proveedor: r.ncf_proveedor ?? "",
      tipo_ncf_proveedor: r.tipo_ncf_proveedor ?? "",
      ncf_modificado: r.ncf_modificado ?? "",
      monto_facturado: Number(r.monto_facturado ?? 0),
      itbis_facturado: Number(r.itbis_facturado ?? 0),
      itbis_retenido: Number(r.itbis_retenido ?? 0),
      isr_retenido: Number(r.isr_retenido ?? 0),
      forma_pago: r.forma_pago ?? "",
      tipo_bienes_servicios: r.tipo_bienes_servicios != null ? String(r.tipo_bienes_servicios) : "",
      monto_facturado_servicios: Number(r.monto_facturado_servicios ?? 0),
      monto_facturado_bienes: Number(r.monto_facturado_bienes ?? 0),
      tipo_retencion_isr: r.tipo_retencion_isr != null ? String(r.tipo_retencion_isr) : "",
      itbis_proporcionalidad_349: Number(r.itbis_proporcionalidad_349 ?? 0),
      itbis_llevado_costo: Number(r.itbis_llevado_costo ?? 0),
      itbis_percibido_compras: Number(r.itbis_percibido_compras ?? 0),
      isr_percibido_compras: Number(r.isr_percibido_compras ?? 0),
      impuesto_selectivo_consumo: Number(r.impuesto_selectivo_consumo ?? 0),
      otros_impuestos_tasas: Number(r.otros_impuestos_tasas ?? 0),
      monto_propina_legal: Number(r.monto_propina_legal ?? 0),
    });
    setFile(null);
    setOpen(true);
  };
  const openNew = () => { setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence(""); setOpen(true); };

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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence(""); } }}>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar gasto</Button>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
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

              <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold">Datos fiscales del proveedor <span className="text-xs font-normal text-muted-foreground">(opcional · Reporte 606)</span></div>
                  <EscanearFacturaButton onExtracted={(d) => setF((prev: any) => ({
                    ...prev,
                    proveedor: prev.proveedor || d.proveedor_nombre || "",
                    concepto: prev.concepto || d.concepto || "",
                    fecha: d.fecha || prev.fecha,
                    rnc_cedula_proveedor: d.rnc_cedula_proveedor ?? prev.rnc_cedula_proveedor,
                    tipo_id_proveedor: d.tipo_id_proveedor ?? prev.tipo_id_proveedor,
                    ncf_proveedor: d.ncf_proveedor ?? prev.ncf_proveedor,
                    ncf_modificado: d.ncf_modificado ?? prev.ncf_modificado,
                    monto_facturado_servicios: d.monto_facturado_servicios ?? prev.monto_facturado_servicios,
                    monto_facturado_bienes: d.monto_facturado_bienes ?? prev.monto_facturado_bienes,
                    itbis_facturado: d.itbis_facturado ?? prev.itbis_facturado,
                  }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipo ID</Label>
                    <Select value={f.tipo_id_proveedor || "__none"} onValueChange={(v) => setF({ ...f, tipo_id_proveedor: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        <SelectItem value="RNC">RNC</SelectItem>
                        <SelectItem value="CEDULA">Cédula</SelectItem>
                        <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>RNC / Cédula</Label>
                    <Input value={f.rnc_cedula_proveedor} onChange={(e) => setF({ ...f, rnc_cedula_proveedor: e.target.value.replace(/\D/g, "") })} placeholder="9 u 11 dígitos" maxLength={11} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>NCF</Label>
                    <Input value={f.ncf_proveedor} onChange={(e) => setF({ ...f, ncf_proveedor: e.target.value.toUpperCase() })} placeholder="11 o 13 caracteres" maxLength={13} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tipo NCF</Label>
                    <Input value={f.tipo_ncf_proveedor} onChange={(e) => setF({ ...f, tipo_ncf_proveedor: e.target.value })} placeholder="Ej: 01, 02, 11…" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>NCF modificado (si aplica)</Label>
                  <Input value={f.ncf_modificado} onChange={(e) => setF({ ...f, ncf_modificado: e.target.value.toUpperCase() })} placeholder="NCF original modificado por nota crédito/débito" maxLength={13} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipo bienes / servicios (606)</Label>
                    <Select value={f.tipo_bienes_servicios || "__none"} onValueChange={(v) => setF({ ...f, tipo_bienes_servicios: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {TIPOS_BIENES_SERVICIOS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tipo retención ISR</Label>
                    <Select value={f.tipo_retencion_isr || "__none"} onValueChange={(v) => setF({ ...f, tipo_retencion_isr: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {TIPOS_RETENCION_ISR.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Monto facturado servicios</Label><Input type="number" step="0.01" value={f.monto_facturado_servicios} onChange={(e) => setF({ ...f, monto_facturado_servicios: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Monto facturado bienes</Label><Input type="number" step="0.01" value={f.monto_facturado_bienes} onChange={(e) => setF({ ...f, monto_facturado_bienes: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ITBIS facturado</Label><Input type="number" step="0.01" value={f.itbis_facturado} onChange={(e) => setF({ ...f, itbis_facturado: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ITBIS retenido</Label><Input type="number" step="0.01" value={f.itbis_retenido} onChange={(e) => setF({ ...f, itbis_retenido: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ISR retenido</Label><Input type="number" step="0.01" value={f.isr_retenido} onChange={(e) => setF({ ...f, isr_retenido: e.target.value })} /></div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Monto facturado total: <b>{(Number(f.monto_facturado_servicios || 0) + Number(f.monto_facturado_bienes || 0)).toFixed(2)}</b>
                </div>
                <div className="grid gap-1.5">
                  <Label>Forma de pago</Label>
                  <Select value={f.forma_pago || "__none"} onValueChange={(v) => setF({ ...f, forma_pago: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="cheque_transferencia">Cheque / Transferencia</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                      <SelectItem value="permuta">Permuta</SelectItem>
                      <SelectItem value="nota_credito">Nota de crédito</SelectItem>
                      <SelectItem value="mixto">Mixto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded border bg-background/60 p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={crearCxp} onChange={(e) => setCrearCxp(e.target.checked)} />
                    <span>También crear cuenta por pagar vinculada a este proveedor</span>
                  </label>
                  {crearCxp && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Fecha de vencimiento del pago (opcional)</Label>
                      <Input type="date" value={cxpVence} onChange={(e) => setCxpVence(e.target.value)} />
                    </div>
                  )}
                </div>
                <details className="rounded border bg-background/60">
                  <summary className="cursor-pointer text-xs font-medium px-3 py-2 select-none">Detalles fiscales avanzados (opcional)</summary>
                  <div className="p-3 space-y-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS sujeto proporcionalidad (Art. 349)</Label><Input type="number" step="0.01" value={f.itbis_proporcionalidad_349} onChange={(e) => setF({ ...f, itbis_proporcionalidad_349: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS llevado al costo</Label><Input type="number" step="0.01" value={f.itbis_llevado_costo} onChange={(e) => setF({ ...f, itbis_llevado_costo: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS percibido en compras</Label><Input type="number" step="0.01" value={f.itbis_percibido_compras} onChange={(e) => setF({ ...f, itbis_percibido_compras: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ISR percibido en compras</Label><Input type="number" step="0.01" value={f.isr_percibido_compras} onChange={(e) => setF({ ...f, isr_percibido_compras: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Impuesto Selectivo al Consumo</Label><Input type="number" step="0.01" value={f.impuesto_selectivo_consumo} onChange={(e) => setF({ ...f, impuesto_selectivo_consumo: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Otros impuestos / tasas</Label><Input type="number" step="0.01" value={f.otros_impuestos_tasas} onChange={(e) => setF({ ...f, otros_impuestos_tasas: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Monto propina legal</Label><Input type="number" step="0.01" value={f.monto_propina_legal} onChange={(e) => setF({ ...f, monto_propina_legal: e.target.value })} /></div>
                    </div>
                  </div>
                </details>
              </div>
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

// --- Utilidades de cálculo de impuestos por línea ---
type TaxCalc = {
  cifLinea: number;
  gravamen: number;
  selectivo: number;
  itbis: number;
  total: number;
};
function calcImpuestosLinea(
  fobLinea: number,
  totalFob: number,
  seguro: number,
  flete: number,
  otros: number,
  pctGravamen: number | null | undefined,
  aplicaIsc: boolean | null | undefined,
  pctIsc: number | null | undefined,
  pctItbis: number | null | undefined,
): TaxCalc {
  const share = totalFob > 0 ? fobLinea / totalFob : 0;
  const cifLinea = fobLinea + (seguro + flete + otros) * share;
  const grav = pctGravamen != null ? cifLinea * (Number(pctGravamen) / 100) : 0;
  const isc = aplicaIsc && pctIsc != null ? (cifLinea + grav) * (Number(pctIsc) / 100) : 0;
  const pIt = pctItbis != null ? Number(pctItbis) : 18;
  const itbis = pctItbis != null || pctGravamen != null ? (cifLinea + grav + isc) * (pIt / 100) : 0;
  const total = grav + isc + itbis;
  return { cifLinea, gravamen: grav, selectivo: isc, itbis, total };
}

// Fuerza el % gravamen que corresponde según la preferencia comercial del expediente
function pickPctFromTasa(
  tasa: any | null | undefined,
  preferenciaComercial: string,
): { pct: number | null; usedPreferencial: boolean } {
  if (!tasa) return { pct: null, usedPreferencial: false };
  const hasPref = tasa.pct_gravamen_preferencial != null;
  const acuerdo = (tasa.acuerdo_preferencial || "").trim().toLowerCase();
  const prefExp = (preferenciaComercial || "").trim().toLowerCase();
  const match = hasPref && acuerdo && prefExp && (acuerdo === prefExp || prefExp.includes(acuerdo) || acuerdo.includes(prefExp));
  if (match) return { pct: Number(tasa.pct_gravamen_preferencial), usedPreferencial: true };
  if (tasa.pct_gravamen != null) return { pct: Number(tasa.pct_gravamen), usedPreferencial: false };
  return { pct: null, usedPreferencial: false };
}

function MercanciaItemsBlock({
  expedienteId,
  seguro,
  flete,
  otros,
  preferenciaComercial,
}: {
  expedienteId: string;
  seguro: number;
  flete: number;
  otros: number;
  preferenciaComercial: string;
}) {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", expedienteId],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const codigos = useMemo(() => Array.from(new Set(((items ?? []) as any[]).map((it) => (it.codigo_arancelario || "").trim()).filter(Boolean))), [items]);
  const { data: tasas } = useQuery({
    queryKey: ["tasas-por-codigos", codigos.join("|")],
    enabled: codigos.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("catalogo_tasas_arancelarias").select("*").in("codigo_arancelario", codigos);
      return data ?? [];
    },
  });
  const tasaByCodigo = useMemo(() => {
    const m = new Map<string, any>();
    (tasas ?? []).forEach((t: any) => m.set(t.codigo_arancelario, t));
    return m;
  }, [tasas]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = {
    codigo_arancelario: "", detalle_producto: "", unidad_medida: "", unidad_codigo: "",
    cantidad: "", peso: "", valor_fob: "",
    pct_gravamen: "", aplica_isc: false as boolean, pct_isc: "", pct_itbis: "18",
  };
  const [f, setF] = useState(emptyForm);

  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mercancia-items", expedienteId] });
    qc.invalidateQueries({ queryKey: ["tasas-por-codigos"] });
  };

  // Auto-alimenta el catálogo con lo que digitó el usuario (solo si no existe o no está verificado; RLS bloquea las verificadas)
  const autoLearnTasa = async (codigo: string, pctGravamen: number | null, aplicaIsc: boolean, pctIsc: number | null) => {
    if (!codigo) return;
    const existing = tasaByCodigo.get(codigo);
    if (existing?.verificado) return; // no tocar verificadas
    const prefExp = (preferenciaComercial || "").trim();
    const usePref = !!prefExp && prefExp.toLowerCase() !== "ninguna";
    const payload: any = {
      codigo_arancelario: codigo,
      aplica_isc: !!aplicaIsc,
      pct_isc: aplicaIsc ? pctIsc : null,
      origen_expediente_id: expedienteId,
    };
    if (pctGravamen != null) {
      if (usePref) {
        payload.pct_gravamen_preferencial = pctGravamen;
        payload.acuerdo_preferencial = prefExp;
        if (existing?.pct_gravamen != null) payload.pct_gravamen = existing.pct_gravamen;
      } else {
        payload.pct_gravamen = pctGravamen;
      }
    }
    await supabase.from("catalogo_tasas_arancelarias").upsert(payload, { onConflict: "codigo_arancelario" });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const codigo = (f.codigo_arancelario || "").trim();
      const payload: any = {
        codigo_arancelario: codigo || null,
        detalle_producto: f.detalle_producto || null,
        unidad_medida: f.unidad_medida || null,
        unidad_codigo: f.unidad_codigo || null,
        cantidad: f.cantidad === "" ? 0 : Number(f.cantidad),
        peso: f.peso === "" ? 0 : Number(f.peso),
        valor_fob: f.valor_fob === "" ? 0 : Number(f.valor_fob),
        pct_gravamen: f.pct_gravamen === "" ? null : Number(f.pct_gravamen),
        aplica_isc: !!f.aplica_isc,
        pct_isc: f.aplica_isc && f.pct_isc !== "" ? Number(f.pct_isc) : null,
        pct_itbis: f.pct_itbis === "" ? null : Number(f.pct_itbis),
      };
      if (editingId) {
        const { error } = await supabase.from("mercancia_items").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const nextNo = ((items ?? []).reduce((m: number, it: any) => Math.max(m, it.item_no || 0), 0)) + 1;
        const { error } = await supabase.from("mercancia_items").insert({ ...payload, expediente_id: expedienteId, item_no: nextNo });
        if (error) throw error;
      }
      await autoLearnTasa(codigo, payload.pct_gravamen, payload.aplica_isc, payload.pct_isc);
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
      pct_gravamen: it.pct_gravamen != null ? String(it.pct_gravamen) : "",
      aplica_isc: !!it.aplica_isc,
      pct_isc: it.pct_isc != null ? String(it.pct_isc) : "",
      pct_itbis: it.pct_itbis != null ? String(it.pct_itbis) : "18",
    });
    setOpen(true);
  };

  // Cuando el usuario digita/pega un código en el diálogo y aún no tiene % gravamen, sugerir desde catálogo
  const onCodigoBlur = async (codigo: string) => {
    const c = (codigo || "").trim();
    if (!c) return;
    // buscar en tasas ya cargadas
    let tasa = tasaByCodigo.get(c);
    if (!tasa) {
      const { data } = await supabase.from("catalogo_tasas_arancelarias").select("*").eq("codigo_arancelario", c).maybeSingle();
      tasa = data;
    }
    if (!tasa) return;
    const { pct } = pickPctFromTasa(tasa, preferenciaComercial);
    setF((prev) => ({
      ...prev,
      pct_gravamen: prev.pct_gravamen === "" && pct != null ? String(pct) : prev.pct_gravamen,
      aplica_isc: prev.aplica_isc || !!tasa.aplica_isc,
      pct_isc: prev.pct_isc === "" && tasa.aplica_isc && tasa.pct_isc != null ? String(tasa.pct_isc) : prev.pct_isc,
    }));
  };

  return (
    <div className="grid gap-3 pt-2 border-t">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle de mercancía</div>
        <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-4 w-4 mr-1" />Agregar ítem</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[1400px]">
          <thead className="bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">Cód. Arancel</th>
              <th className="px-2 py-2 text-left">Detalle</th>
              <th className="px-2 py-2 text-left">Unidad</th>
              <th className="px-2 py-2 text-right">Cantidad</th>
              <th className="px-2 py-2 text-right">Peso</th>
              <th className="px-2 py-2 text-right">FOB (US$)</th>
              <th className="px-2 py-2 text-right bg-amber-50">% Grav.</th>
              <th className="px-2 py-2 text-center bg-amber-50">ISC?</th>
              <th className="px-2 py-2 text-right bg-amber-50">% ISC</th>
              <th className="px-2 py-2 text-right bg-slate-50">CIF línea</th>
              <th className="px-2 py-2 text-right bg-slate-50">Gravamen</th>
              <th className="px-2 py-2 text-right bg-slate-50">Selectivo</th>
              <th className="px-2 py-2 text-right bg-slate-50">ITBIS</th>
              <th className="px-2 py-2 text-right bg-emerald-50">Total imp.</th>
              <th className="px-2 py-2 text-right w-20"></th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).length === 0 ? (
              <tr><td colSpan={16} className="px-3 py-6 text-center text-xs text-muted-foreground">Sin ítems. Agrega el primero.</td></tr>
            ) : (items ?? []).map((it: any) => {
              const c = calcImpuestosLinea(
                Number(it.valor_fob) || 0, totalFob, seguro, flete, otros,
                it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis,
              );
              const tasa = tasaByCodigo.get((it.codigo_arancelario || "").trim());
              const unverifiedHint = tasa && !tasa.verificado && it.pct_gravamen != null;
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{it.item_no}</td>
                  <td className="px-2 py-2 tabular-nums font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <span>{it.codigo_arancelario || "—"}</span>
                      {unverifiedHint && (
                        <span title="Tasa sugerida por historial; aún no verificada por Administrador." className="inline-flex">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 max-w-[220px] truncate" title={it.detalle_producto || ""}>{it.detalle_producto || "—"}</td>
                  <td className="px-2 py-2 text-xs">{it.unidad_medida || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(it.cantidad || 0).toLocaleString("en-US")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(it.peso || 0).toLocaleString("en-US")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(Number(it.valor_fob || 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">{it.pct_gravamen != null ? `${Number(it.pct_gravamen)}%` : <span className="text-amber-600 text-xs">—</span>}</td>
                  <td className="px-2 py-2 text-center bg-amber-50/40 text-xs">{it.aplica_isc ? "Sí" : "No"}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">{it.aplica_isc && it.pct_isc != null ? `${Number(it.pct_isc)}%` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{fmt(c.cifLinea)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{fmt(c.gravamen)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{fmt(c.selectivo)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{fmt(c.itbis)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/60 font-semibold">{fmt(c.total)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminar.mutate(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {(items ?? []).length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={6} className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(totalFob)}</td>
                <td colSpan={7}></td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold bg-emerald-50/60">
                  {fmt((items ?? []).reduce((s: number, it: any) => s + calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis).total, 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Prorrateo: <b>CIF línea</b> = FOB línea + (Seguro+Flete+Otros) × (FOB línea / Total FOB). Ajusta % Gravamen / ISC al editar el ítem; el sistema guardará esa tasa en el catálogo para futuros expedientes.
        <span className="inline-flex items-center gap-1 ml-2"><AlertTriangle className="h-3 w-3 text-amber-500" /> = tasa aprendida, sin verificar por Admin.</span>
      </p>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Editar ítem" : "Nuevo ítem"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Código Arancelario</Label>
              <Input
                value={f.codigo_arancelario}
                onChange={(e) => setF({ ...f, codigo_arancelario: e.target.value })}
                onBlur={(e) => onCodigoBlur(e.target.value)}
                placeholder="0402.10.90"
              />
              {(() => {
                const c = (f.codigo_arancelario || "").trim();
                const t = c ? tasaByCodigo.get(c) : null;
                if (!c) return null;
                if (!t) return <span className="text-[11px] text-slate-500">Código nuevo — se agregará al catálogo al guardar.</span>;
                return (
                  <span className={`text-[11px] flex items-center gap-1 ${t.verificado ? "text-emerald-700" : "text-amber-700"}`}>
                    {t.verificado ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {t.verificado ? "Tasa verificada por Admin." : "Tasa sugerida (sin verificar)."}
                  </span>
                );
              })()}
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

            <div className="md:col-span-2 border-t pt-3 mt-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Impuestos de la línea</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>% Gravamen</Label>
                  <Input type="text" inputMode="decimal" value={f.pct_gravamen}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_gravamen: v }); }}
                    placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>¿Aplica ISC?</Label>
                  <div className="h-9 flex items-center gap-2">
                    <Switch checked={f.aplica_isc} onCheckedChange={(v) => setF({ ...f, aplica_isc: v, pct_isc: v ? f.pct_isc : "" })} />
                    <span className="text-sm text-muted-foreground">{f.aplica_isc ? "Sí" : "No"}</span>
                  </div>
                </div>
                {f.aplica_isc && (
                  <div className="grid gap-1.5">
                    <Label>% Selectivo (ISC)</Label>
                    <Input type="text" inputMode="decimal" value={f.pct_isc}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_isc: v }); }}
                      placeholder="0" />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>% ITBIS</Label>
                  <Input type="text" inputMode="decimal" value={f.pct_itbis}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_itbis: v }); }}
                    placeholder="18" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Por defecto 18%. Solo editar si aplica una excepción.</p>
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

function LiquidacionEstimadaBlock({
  exp, seguro, flete, otros,
}: { exp: any; seguro: number; flete: number; otros: number }) {
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null).order("item_no")).data ?? [],
  });
  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const totalCif = totalFob + seguro + flete + otros;
  const totals = (items ?? []).reduce((acc: any, it: any) => {
    const c = calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis);
    acc.gravamen += c.gravamen; acc.selectivo += c.selectivo; acc.itbis += c.itbis; acc.total += c.total;
    return acc;
  }, { gravamen: 0, selectivo: 0, itbis: 0, total: 0 });
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const anyPct = (items ?? []).some((it: any) => it.pct_gravamen != null || it.aplica_isc);

  const tc = useTasaCambioForExpediente(exp);
  const [rateInput, setRateInput] = useState("");
  const tasa = tc.tasa;
  const rd = (n: number) => tasa != null ? fmt(n * tasa) : "—";

  return (
    <div className="grid gap-4 pt-4 border-t">
      {tc.needsCapture && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <div className="font-semibold text-sm text-amber-900">Tasa de Cambio requerida</div>
          </div>
          <p className="text-xs text-amber-900 mb-3">
            No existe una Tasa Oficial DGA para <b>{tc.fechaLabel}</b>. Ingrésala una sola vez y quedará
            guardada en el catálogo para todos los expedientes de ese día.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">RD$ por US$ 1.00</Label>
              <Input
                className="w-40 font-mono tabular-nums"
                inputMode="decimal"
                placeholder="59.4100"
                value={rateInput}
                onChange={(e) => { const v = e.target.value.replace(/[$,\s]/g, ""); if (v === "" || /^\d*\.?\d{0,4}$/.test(v)) setRateInput(v); }}
              />
            </div>
            <a href="https://www.aduanas.gob.do/tasa-de-cambio/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline flex items-center gap-1 pb-2.5">
              Ver tasa oficial en aduanas.gob.do <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              size="sm"
              className="ml-auto"
              disabled={tc.guardar.isPending || !rateInput || Number(rateInput) <= 0}
              onClick={() => tc.guardar.mutate(Number(rateInput), {
                onSuccess: () => { toast.success(`Tasa RD$ ${rateInput} guardada para ${tc.fechaLabel}`); setRateInput(""); },
                onError: (e: any) => toast.error(e.message),
              })}
            >
              {tc.guardar.isPending ? "Guardando…" : "Guardar tasa"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <div className="font-semibold text-amber-900 text-sm">Liquidación de Impuestos — <span className="uppercase">Estimada</span></div>
          <span className="ml-auto text-right text-[11px] leading-tight">
            {tasa != null ? (
              <>
                <div className="text-amber-900 font-semibold">Tasa Oficial: RD$ {tasa.toFixed(4)} / US$1</div>
                <div className="text-amber-800">
                  {tc.fechaLabel}
                  {tc.origen === "congelada" && <span className="ml-1 inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3 w-3" />congelada</span>}
                </div>
              </>
            ) : (
              <span className="text-amber-800">Tasa Oficial DGA no capturada</span>
            )}
          </span>
        </div>
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-amber-100/40 text-[11px] uppercase text-amber-900">
            <tr>
              <th className="text-left px-4 py-1.5 font-medium">Concepto</th>
              <th className="text-right px-4 py-1.5 w-36 font-medium">US$</th>
              <th className="text-right px-4 py-1.5 w-44 font-medium">RD$</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Total FOB</td><td className="text-right">{fmt(totalFob)}</td><td className="text-right">{rd(totalFob)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Seguro</td><td className="text-right">{fmt(seguro)}</td><td className="text-right">{rd(seguro)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Flete</td><td className="text-right">{fmt(flete)}</td><td className="text-right">{rd(flete)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Otros</td><td className="text-right">{fmt(otros)}</td><td className="text-right">{rd(otros)}</td></tr>
            <tr className="border-t border-amber-200 bg-amber-100/30 font-semibold"><td className="px-4 py-1.5">Total CIF</td><td className="text-right">{fmt(totalCif)}</td><td className="text-right">{rd(totalCif)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Total Gravamen</td><td className="text-right">{fmt(totals.gravamen)}</td><td className="text-right">{rd(totals.gravamen)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Total Selectivo (ISC)</td><td className="text-right">{fmt(totals.selectivo)}</td><td className="text-right">{rd(totals.selectivo)}</td></tr>
            <tr className="border-t border-amber-200/60"><td className="px-4 py-1.5 text-muted-foreground">Total ITBIS</td><td className="text-right">{fmt(totals.itbis)}</td><td className="text-right">{rd(totals.itbis)}</td></tr>
            <tr className="border-t-2 border-primary bg-primary text-primary-foreground font-bold">
              <td className="px-4 py-2.5 text-sm">TOTAL A PAGAR</td>
              <td className="text-right text-base">{fmt(totals.total)}</td>
              <td className="text-right text-base">{rd(totals.total)}</td>
            </tr>
          </tbody>
        </table>
        {!anyPct && (
          <div className="px-4 py-2 text-[11px] text-amber-800 italic border-t border-amber-200">
            Aún no has capturado % Gravamen ni Selectivo en las líneas. Edita cada ítem para calcular impuestos.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultadoOficialBlock({ exp, form, set }: { exp: any; form: any; set: (k: string, v: any) => void }) {
  const tc = useTasaCambioForExpediente(exp);
  // Estimado total en US$: recalculado a partir de items — para simplicidad, tomamos del form (mercancía se recalcula por línea).
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null)).data ?? [],
  });
  const seguro = Number(form.seguro) || 0;
  const flete = Number(form.flete) || 0;
  const otros = Number(form.otros) || 0;
  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const estimadoUsd = (items ?? []).reduce((acc: number, it: any) => {
    const c = calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis);
    return acc + c.total;
  }, 0);
  const estimadoRd = tc.tasa != null ? estimadoUsd * tc.tasa : null;
  const oficialRd = form.liq_oficial_total === "" || form.liq_oficial_total == null ? null : Number(form.liq_oficial_total);
  const dif = oficialRd != null && estimadoRd != null ? oficialRd - estimadoRd : null;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border p-4 bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="h-4 w-4 text-primary" />
        <div className="font-semibold text-sm">Resultado oficial DGA</div>
        <Badge variant="outline" className="text-[10px] ml-auto">Opcional · al recibir la liquidación</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>N.º Liquidación SIGA</Label>
          <Input value={form.liq_siga_numero || ""} onChange={(e) => set("liq_siga_numero", e.target.value)} placeholder="LIQ-2026-000123" />
        </div>
        <div className="grid gap-1.5">
          <Label>Estado</Label>
          <Select value={form.liq_siga_estado || undefined} onValueChange={(v) => set("liq_siga_estado", v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona estado" /></SelectTrigger>
            <SelectContent>
              {["Inspeccionada", "Liberada", "Con observación", "Rectificada"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Total oficial (RD$)</Label>
          <Input type="text" inputMode="decimal" value={form.liq_oficial_total ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[$,\s]/g, ""); if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set("liq_oficial_total", v); }}
            placeholder="0.00" className="tabular-nums" />
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        {estimadoRd != null && (
          <div>Estimado (RD$): <span className="font-mono tabular-nums text-foreground">{fmt(estimadoRd)}</span></div>
        )}
        {dif != null && (
          <div>
            Diferencia vs. estimado:{" "}
            <span className={`font-semibold tabular-nums ${dif >= 0 ? "text-destructive" : "text-emerald-700"}`}>
              {dif >= 0 ? "+" : "−"} RD$ {fmt(Math.abs(dif))}
            </span>
          </div>
        )}
        {tc.congelado && (
          <div className="inline-flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> Tasa RD$ {tc.tasa?.toFixed(4)} congelada para trazabilidad histórica.
          </div>
        )}
      </div>
    </div>
  );
}

function HerramientasDgaVuce() {
  const tools = [
    { label: "Buscador de Productos", url: "https://www.aduanas.gob.do/consultas/buscador-de-productos/", icon: Search },
    { label: "Consulta Aranceles VUCE", url: "https://sirevuce.aduanas.gob.do/", icon: FileText },
    { label: "Arancel de Aduanas 7ma Enmienda 2022", url: "https://www.aduanas.gob.do/consultas/arancel-de-aduanas-7ma-enmienda-2022/", icon: Scale },
    { label: "Portal VUCE-RD", url: "https://vucerd.gob.do/", icon: ShieldCheck },
    { label: "Portal SIGA", url: "https://siga.aduanas.gob.do/", icon: LayoutGrid },
    { label: "VUCE - Gestión de Trámites", url: "https://app.vucerd.gob.do/auth", icon: FileCheck },
  ];

  return (
    <div className="md:col-span-2 lg:col-span-3">
      <div className="rounded-lg border border-dashed border-accent/30 bg-accent/[0.03] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Clock className="h-4 w-4 text-accent" />
          <span>Herramientas DGA/VUCE</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <a
                key={t.url}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2.5 text-sm hover:border-accent/50 hover:bg-accent/5 transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0 text-accent" />
                <span className="flex-1 leading-tight">{t.label}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-accent" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}




