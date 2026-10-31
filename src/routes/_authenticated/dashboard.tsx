import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ship, Clock, FileWarning, TrendingUp, Bell, Truck, RefreshCw, Mail, Banknote, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useReminders, type Reminder, type ReminderKind } from "@/lib/reminders";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { daysFromToday } from "@/lib/dates";
import { ESTADO_LABEL } from "@/lib/estados-expediente";
import { cotizacionEstadoLabel, COTIZACION_ESTADO_CLASS } from "@/lib/estados-cotizacion";
import { obtenerCorreosPendientes } from "@/lib/correos-pendientes-kpi";
import { obtenerPagosTransportistaPendientes } from "@/lib/pagos-transportista-kpi";
import { useDatosAlertasListado } from "@/lib/use-alertas-expediente";
import { usePlazosRegimen } from "@/lib/plazo-presentacion";
import { recordatoriosAlertasExpedientes } from "@/lib/alertas-expediente-panel";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Panel de Operaciones | ADECOMEX" },
    { name: "description", content: "Control operativo de expedientes, logística, permisos y correos pendientes de ADECOMEX." },
    { property: "og:title", content: "Panel de Operaciones | ADECOMEX" },
    { property: "og:description", content: "Seguimiento operativo de importaciones y comunicaciones pendientes de ADECOMEX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function KPI({ icon: Icon, label, value, tone = "primary", sub }: any) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[var(--success)]/10 text-[var(--success)]",
    warning: "bg-[var(--warning)]/15 text-[var(--warning-foreground)]",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-[var(--info)]/10 text-[var(--info)]",
  };
  return (
    <Card className={`h-full cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${tone === "danger" ? "border-destructive/30 bg-destructive/10" : ""}`}>
      <CardContent className="p-2.5">
        <div className="min-w-0">
          <div className="min-h-12 text-xs leading-4 text-muted-foreground">{label}</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0 text-2xl font-display font-bold tabular-nums">{value ?? "—"}</div>
            <div className={`h-8 w-8 shrink-0 grid place-items-center rounded-md ${toneMap[tone]}`}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="min-h-8 text-xs leading-4 text-muted-foreground mt-2">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: correosPendientes, isError: errorCorreos } = useQuery({
    queryKey: ["correos-pendientes-kpi"],
    queryFn: () => obtenerCorreosPendientes(supabase),
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const { data: pagosTransportista, isError: errorPagos } = useQuery({
    queryKey: ["pagos-transportista-kpi"],
    queryFn: () => obtenerPagosTransportistaPendientes(supabase),
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [cot, exp, per, tra, log] = await Promise.all([
        supabase.from("cotizaciones").select("id,numero,estado,created_at,updated_at,clientes(nombre)").is("eliminado_en", null),
        supabase.from("expedientes").select("id,numero,estado,etapa_actual,fecha_compromiso,created_at").is("eliminado_en", null),
        supabase.from("permisos").select("id,estado,fecha_vencimiento").is("eliminado_en", null),
        supabase.from("transportes").select("id,estado,eta").is("eliminado_en", null),
        supabase.from("operaciones_logistica").select("id,estado").is("eliminado_en", null),
      ]);
      return {
        cotizaciones: cot.data ?? [],
        expedientes: exp.data ?? [],
        permisos: per.data ?? [],
        transportes: tra.data ?? [],
        operacionesLogistica: log.data ?? [],
      };
    },
  });

  const { reminders, isLoading: isLoadingReminders } = useAlertasPanel();

  const operacionesLogisticaActivas = stats?.operacionesLogistica.filter((o) => o.estado !== "arribo").length ?? 0;
  const expedientesEnTransito = stats?.expedientes.filter((e) => e.estado === "en_transito").length ?? 0;
  const expedientesPorLlegar = stats?.expedientes.filter((e) => {
    if (!e.fecha_compromiso) return false;
    if (["facturar", "entregado"].includes(e.estado)) return false;
    const d = daysFromToday(e.fecha_compromiso);
    return d >= 0 && d <= 7;
  }).length ?? 0;
  const permisosPorVencer = stats?.permisos.filter((p) => {
    if (!p.fecha_vencimiento) return false;
    if (p.estado !== "solicitado" && p.estado !== "en_tramite") return false;
    const d = daysFromToday(p.fecha_vencimiento);
    return d >= 0 && d <= 15;
  }).length ?? 0;
  const transportesEnTransito = stats?.transportes.filter((t) => t.estado === "en_transito" || t.estado === "programado").length ?? 0;

  const ultimasCot = [...(stats?.cotizaciones ?? [])].sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);
  const ultimosExp = [...(stats?.expedientes ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Panel de operaciones</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            qc.invalidateQueries({ queryKey: ["reminders"] });
            qc.invalidateQueries({ queryKey: ["correos-pendientes-kpi"] });
            qc.invalidateQueries({ queryKey: ["pagos-transportista-kpi"] });
            qc.invalidateQueries({ queryKey: ["expedientes-alertas-panel"] });
            qc.invalidateQueries({ queryKey: ["alertas-expedientes-listado"] });
            qc.invalidateQueries({ queryKey: ["plazos-regimen"] });
            toast.success("Actualizado");
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refrescar
        </Button>
      </div>

      <div aria-label="Indicadores de operaciones" className="grid grid-flow-col auto-cols-[168px] gap-2 overflow-x-auto pb-2 xl:grid-flow-row xl:auto-cols-auto xl:grid-cols-[repeat(8,minmax(0,1fr))] xl:overflow-x-visible">
        <Link to="/expedientes/correo" aria-label="Ver correos pendientes" className="h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Mail} label="Correos pendientes" value={correosPendientes?.total} tone={correosPendientes?.total ? "danger" : "primary"} sub={correosPendientes ? `${correosPendientes.porConvertir} por convertir · ${correosPendientes.porResponder} por responder` : errorCorreos ? "No disponible" : "Consultando…"} /></Link>
        <Link to="/admin/solicitudes-pago-transporte" search={{ estado: "pendiente" }} aria-label="Ver pagos de transportista pendientes" className="h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Banknote} label="Pagos transportista pendientes" value={pagosTransportista?.total} tone={pagosTransportista?.total ? "danger" : "primary"} sub={pagosTransportista ? pagosTransportista.sub : errorPagos ? "No disponible" : "Consultando…"} /></Link>
        <Link to="/logistica" search={{ estado: "activas" }} aria-label="Ver operaciones de logística activas" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Ship} label="Logística en curso" value={operacionesLogisticaActivas} tone="info" /></Link>
        <Link to="/expedientes" search={{ estado: "en_transito" }} aria-label="Ver expedientes en tránsito" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Ship} label="Expedientes en tránsito" value={expedientesEnTransito} tone="info" /></Link>
        <Link to="/expedientes" search={{ eta: 7 }} aria-label="Ver expedientes por llegar" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Clock} label="Expedientes por llegar" value={expedientesPorLlegar} tone={expedientesPorLlegar ? "danger" : "primary"} sub="Próximos 7 días" /></Link>
        <Link to="/permisos" search={{ vencimiento: 15 }} aria-label="Ver permisos VUCE por vencer" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={FileWarning} label="Permisos VUCE por vencer" value={permisosPorVencer} tone="warning" sub="Próximos 15 días" /></Link>
        <Link to="/transportes" search={{ estado: "en_transito,programado" }} aria-label="Ver transportes en tránsito" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Truck} label="Transportes en tránsito" value={transportesEnTransito} tone="info" /></Link>
        <Link to="/dashboard" hash="atencion-requerida" aria-label="Ver alertas activas" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={AlertTriangle} label="Alertas activas" value={isLoadingReminders ? null : reminders.length} tone="danger" /></Link>
      </div>

      <div id="atencion-requerida" className="scroll-mt-4"><RemindersPanel /></div>


      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Últimas Cotizaciones de Compras</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky-table-header text-xs text-muted-foreground border-b">
                <tr><th className="text-left px-4 py-2">Cotización</th><th className="text-left">Cliente</th><th className="text-left">Estado</th><th /></tr>
              </thead>
              <tbody>
                {ultimasCot.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">
                      <Link to="/cotizaciones/$id" params={{ id: c.id }} className="hover:underline">{c.numero ?? c.id.slice(0, 8)}</Link>
                    </td>
                    <td className="text-xs">{c.clientes?.nombre ?? "—"}</td>
                    <td>
                      <Badge className={COTIZACION_ESTADO_CLASS[c.estado] ?? "bg-muted text-muted-foreground border-transparent"}>
                        {cotizacionEstadoLabel(c.estado)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground text-right">{new Date(c.created_at).toLocaleDateString("es-DO")}</td>
                  </tr>
                ))}
                {ultimasCot.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin cotizaciones registradas</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2"><TrendingUp className="h-4 w-4" />Últimos expedientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky-table-header text-xs text-muted-foreground border-b">
                <tr><th className="text-left px-4 py-2">Expediente</th><th className="text-left">Estado</th><th className="text-left">Etapa</th><th /></tr>
              </thead>
              <tbody>
                {ultimosExp.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">
                      <Link to="/expedientes/$id" params={{ id: e.id }} className="expediente-numero hover:underline">{e.numero ?? e.id.slice(0, 8)}</Link>
                    </td>
                    <td><EstadoBadge value={e.estado} /></td>
                    <td><Badge variant="outline" className="text-[10px]">Etapa {e.etapa_actual ?? 1} de 14</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground text-right">{new Date(e.created_at).toLocaleDateString("es-DO")}</td>
                  </tr>
                ))}
                {ultimosExp.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin expedientes registrados</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Pinta en rojo el tramo del texto que marca el plazo (solo alertas urgentes).
function TextoConResaltado({ texto, resaltar }: { texto: string; resaltar?: string }) {
  if (!resaltar || !texto.includes(resaltar)) return <>{texto}</>;
  const i = texto.indexOf(resaltar);
  return (
    <>
      {texto.slice(0, i)}
      <span className="text-destructive font-semibold">{resaltar}</span>
      {texto.slice(i + resaltar.length)}
    </>
  );
}


function EstadoBadge({ value, className }: { value: string; className?: string }) {
  const map: Record<string, string> = {
    recibida: "bg-[var(--info)]/15 text-[var(--info)] border-transparent",
    en_revision: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
    aprobada: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
    rechazada: "bg-destructive/15 text-destructive border-transparent",
    convertida: "bg-primary/15 text-primary border-transparent",
    digitar: "bg-[var(--info)]/15 text-[var(--info)] border-transparent",
    en_transito: "bg-[var(--info)]/15 text-[var(--info)] border-transparent",
    presentar: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
    verificar: "bg-primary/15 text-primary border-transparent",
    despachado: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
    entregado: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
    facturar: "bg-accent/20 text-accent-foreground border-transparent",
  };
  const label = ESTADO_LABEL[value] ?? value?.replace("_", " ");
  return <Badge className={`text-[10px] ${map[value] ?? "bg-muted text-muted-foreground border-transparent"} ${className ?? ""}`}>{label}</Badge>;
}

function PrioridadBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    baja: "bg-muted text-muted-foreground",
    media: "bg-[var(--info)]/15 text-[var(--info)]",
    alta: "bg-[var(--warning)]/25 text-[var(--warning-foreground)]",
    urgente: "bg-destructive/15 text-destructive",
  };
  return <Badge className={`${map[value] ?? "bg-muted"} border-transparent`}>{value}</Badge>;
}

type GroupDef = { key: string; label: string; emoji: string; kinds: ReminderKind[] };

const REMINDER_GROUPS: GroupDef[] = [
  { key: "hitos", label: "Hitos atrasados / críticos", emoji: "🔴", kinds: ["hito_atrasado", "hito_proximo"] },
  { key: "eta", label: "ETA / Expedientes", emoji: "🟡", kinds: ["eta_proximo"] },
  { key: "documentos", label: "Documentos pendientes", emoji: "📄", kinds: ["expediente_documentos"] },
  { key: "permisos-pendientes", label: "Permisos pendientes de aprobación", emoji: "📋", kinds: ["expediente_permisos"] },
  { key: "etapa", label: "Etapa estancada", emoji: "⏳", kinds: ["expediente_etapa"] },
  { key: "mora", label: "Facturas en mora", emoji: "💳", kinds: ["expediente_mora"] },
  { key: "recepcion", label: "Discrepancias de recepción", emoji: "📦", kinds: ["expediente_recepcion"] },
  { key: "pin", label: "PIN de pago DGA", emoji: "⚠️", kinds: ["expediente_pin"] },
  { key: "permisos", label: "Permisos VUCE por vencer", emoji: "🟠", kinds: ["permiso_vencido", "permiso_por_vencer"] },
  { key: "transportes", label: "Transportes retrasados", emoji: "🚚", kinds: ["transporte_retrasado"] },
  { key: "solicitudes", label: "Solicitudes sin convertir", emoji: "📥", kinds: ["solicitud_sin_convertir"] },
  { key: "plazo", label: "Plazo de presentación en aduana", emoji: "⚠️", kinds: ["plazo_presentacion"] },
];

function useAlertasPanel() {
  const base = useReminders();
  const expedientes = useQuery({
    queryKey: ["expedientes-alertas-panel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expedientes")
        .select("id,numero,cliente_id,factura_ecf_id,estado,updated_at,fecha_compromiso,fecha_llegada_real,regimen_aduanero,plazo_presentar_override,fecha_presentacion_real,liq_siga_termino_at,liq_siga_fecha_pago,clientes(nombre)")
        .is("eliminado_en", null);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5 * 60_000,
  });
  const evidencias = useDatosAlertasListado(expedientes.data ?? []);
  const plazos = usePlazosRegimen();
  const compartidas = recordatoriosAlertasExpedientes(expedientes.data ?? [], plazos.data, evidencias.data ?? {});
  // La etapa y la presentación del panel sustituyen los cálculos antiguos por los del listado.
  const reminders = [
    ...base.visible.filter(r => r.kind !== "expediente_inactivo" && r.kind !== "plazo_presentacion"),
    ...compartidas.filter(r => !base.dismissed.has(r.id)),
  ].filter(r => REMINDER_GROUPS.some(g => g.kinds.includes(r.kind)));
  return { reminders, dismiss: base.dismiss, isLoading: base.isLoading || expedientes.isLoading || evidencias.isLoading || plazos.isLoading,
    isError: expedientes.isError || evidencias.isError || plazos.isError };
}

// Más urgente primero: atrasados, luego menos días restantes; sin plazo al final (orden estable).
function ordenarPorUrgencia(items: Reminder[]): Reminder[] {
  return items
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.diasRestantes ?? Infinity) - (b.r.diasRestantes ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
}

function RemindersPanel() {
  const { reminders, dismiss, isLoading, isError } = useAlertasPanel();

  const grouped = REMINDER_GROUPS
    .map((g) => ({ ...g, items: ordenarPorUrgencia(reminders.filter((r) => g.kinds.includes(r.kind))) }))
    .filter((g) => g.items.length > 0);

  // Reparto balanceado: cada categoría va a la columna con menos ítems (encabezado cuenta 1).
  const columnas: (typeof grouped)[] = [[], []];
  const pesos = [0, 0];
  for (const g of [...grouped].sort((a, b) => b.items.length - a.items.length)) {
    const i = pesos[0] <= pesos[1] ? 0 : 1;
    columnas[i].push(g);
    pesos[i] += g.items.length + 1;
  }
  const orden = new Map(grouped.map((g, i) => [g.key, i]));
  // Con una sola categoría activa, usar todo el ancho para que las alertas quepan en dos filas.
  const dosColumnas = columnas[0].length > 0 && columnas[1].length > 0;
  columnas.forEach((c) => c.sort((a, b) => (orden.get(a.key) ?? 0) - (orden.get(b.key) ?? 0)));
  const defaultOpen = grouped.map((g) => g.key);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Bell className="h-4 w-4" /> Atención requerida
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{reminders.length}</Badge>
          {reminders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => reminders.forEach((r) => dismiss(r.id))}
            >
              Marcar todo visto
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isError && <div role="alert" className="px-4 py-2 text-sm text-destructive">No se pudieron consultar todas las alertas de expedientes. Intente refrescar.</div>}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando alertas…</div>
        ) : reminders.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sin alertas pendientes 🎉</div>
        ) : (
          <div className={`grid grid-cols-1 items-start ${dosColumnas ? "lg:grid-cols-2 lg:divide-x" : ""}`}>
            {columnas.map((col, ci) =>
              col.length === 0 ? null : (
            <Accordion key={ci} type="multiple" defaultValue={defaultOpen} className="w-full">
              {col.map((g) => (
                <AccordionItem key={g.key} value={g.key} className="border-b">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-base leading-none">{g.emoji}</span>
                      <span className="text-sm font-medium">{g.label}</span>
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
                        {g.items.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/30 text-[11px] uppercase text-muted-foreground">
                          <span className="h-2 w-2 shrink-0" aria-hidden />
                          <div className="min-w-0 flex-1" />
                          {g.key === "eta" && <span className="w-[30px] shrink-0 text-center">Docs</span>}
                          {g.key === "eta" && <span className="w-[70px] shrink-0 text-center">Estado</span>}
                          <span className="w-[60px] shrink-0 text-center">Prioridad</span>
                          <span className="w-[44px] shrink-0 text-center">Visto</span>
                        </div>
                    <ul className="divide-y border-t">
                      {g.items.map((r) => (
                        <li key={r.id} className="px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 hover:bg-muted/40">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              r.severity === "critica"
                                ? "bg-destructive"
                                : r.severity === "alta"
                                ? "bg-[var(--warning)]"
                                : "bg-[var(--info)]"
                            }`}
                          />
                          <div className="min-w-0 flex-1 basis-[calc(100%-16px)] sm:basis-auto">
                            <Link to={r.href} className="text-[13px] font-medium hover:underline">
                              <TextoConResaltado texto={r.title} resaltar={r.resaltar} />
                            </Link>
                            <div className="text-xs text-muted-foreground break-words" title={r.detail}>
                              <TextoConResaltado texto={r.detail} resaltar={r.resaltar} />
                            </div>
                          </div>
                          {g.key === "eta" && (
                            <span
                              className={`w-[30px] shrink-0 flex justify-center ${r.tieneDocumentos ? "text-[var(--success)]" : "text-muted-foreground/40"}`}
                              title={r.tieneDocumentos ? "Con documentos cargados" : "Sin documentos cargados"}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {g.key === "eta" && (
                            <span className="w-[70px] shrink-0 flex justify-center">
                              {r.estado ? <EstadoBadge value={r.estado} className="px-1" /> : <span className="text-xs text-muted-foreground">—</span>}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase w-[60px] px-1 justify-center shrink-0"
                          >
                            {r.severity}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-1 w-[44px] justify-center shrink-0"
                            onClick={() => dismiss(r.id)}
                          >
                            Visto
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
