import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ship, Clock, FileWarning, TrendingUp, Bell, Truck, RefreshCw, Mail, Banknote, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useReminders, type Reminder, type ReminderKind } from "@/lib/reminders";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { daysFromToday } from "@/lib/dates";
import { ESTADO_LABEL } from "@/lib/estados-expediente";
import { cotizacionEstadoLabel, COTIZACION_ESTADO_CLASS } from "@/lib/estados-cotizacion";
import { obtenerCorreosPendientes } from "@/lib/correos-pendientes-kpi";
import { obtenerPagosTransportistaPendientes } from "@/lib/pagos-transportista-kpi";
import { useDatosAlertasListado } from "@/lib/use-alertas-expediente";
import { usePlazosRegimen } from "@/lib/plazo-presentacion";
import { recordatoriosAlertasExpedientes } from "@/lib/alertas-expediente-panel";
import { KpiFilaOrdenable, useOrdenKpiPanel } from "@/components/kpi-fila-ordenable";
import { AlertasColumnasOrdenables, useDisposicionAlertas } from "@/components/alertas-columnas-ordenables";
import type { GrupoAlertaId } from "@/lib/panel-alertas-disposicion";
import {
  CLAVE_NOVEDADES_INCLUIR_MEDIA,
  filtrarNovedadesPanel,
  guardarIncluirMedia,
  leerIncluirMedia,
  marcarNovedadesVistas,
  obtenerNovedadesPanel,
  type NovedadPanel,
} from "@/lib/novedades-panel";
import { textoFechaNovedad } from "@/lib/novedades-comercio";
import { EnlaceNovedad } from "@/components/novedades/enlace-novedad";
import { obtenerAlertasCorreo, marcarAlertasCorreoVistas, correoAtascado, type CorreoRecibido } from "@/lib/correos-recibidos";
import { propuestasPendientes } from "@/lib/correo-expediente";


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
          <div className="min-h-12 pr-4 text-xs leading-4 text-muted-foreground">{label}</div>
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
  const ordenKpi = useOrdenKpiPanel();

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
        <div className="flex items-center gap-2">
        {ordenKpi.personalizado && (
          <Button variant="ghost" size="sm" onClick={ordenKpi.restablecer} title="Volver al orden original de las tarjetas">
            Restablecer orden
          </Button>
        )}
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
      </div>

      <KpiFilaOrdenable tarjetas={{
      "correos": <Link to="/expedientes/correo" aria-label="Ver correos pendientes" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Mail} label="Correos pendientes" value={correosPendientes?.total} tone={correosPendientes?.total ? "danger" : "primary"} sub={correosPendientes ? `${correosPendientes.porConvertir} por convertir · ${correosPendientes.porResponder} por responder` : errorCorreos ? "No disponible" : "Consultando…"} /></Link>,
      "pagos-transportista": <Link to="/admin/solicitudes-pago-transporte" search={{ estado: "pendiente" }} aria-label="Ver pagos de transportista pendientes" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Banknote} label="Pagos transportista pendientes" value={pagosTransportista?.total} tone={pagosTransportista?.total ? "danger" : "primary"} sub={pagosTransportista ? pagosTransportista.sub : errorPagos ? "No disponible" : "Consultando…"} /></Link>,
      "logistica": <Link to="/logistica" search={{ estado: "activas" }} aria-label="Ver operaciones de logística activas" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Ship} label="Logística en curso" value={operacionesLogisticaActivas} tone="info" /></Link>,
      "expedientes-transito": <Link to="/expedientes" search={{ estado: "en_transito" }} aria-label="Ver expedientes en tránsito" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Ship} label="Expedientes en tránsito" value={expedientesEnTransito} tone="info" /></Link>,
      "expedientes-por-llegar": <Link to="/expedientes" search={{ eta: 7 }} aria-label="Ver expedientes por llegar" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Clock} label="Expedientes por llegar" value={expedientesPorLlegar} tone={expedientesPorLlegar ? "danger" : "primary"} sub="Próximos 7 días" /></Link>,
      "permisos-vuce": <Link to="/permisos" search={{ vencimiento: 15 }} aria-label="Ver permisos VUCE por vencer" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={FileWarning} label="Permisos VUCE por vencer" value={permisosPorVencer} tone="warning" sub="Próximos 15 días" /></Link>,
      "transportes": <Link to="/transportes" search={{ estado: "en_transito,programado" }} aria-label="Ver transportes en tránsito" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Truck} label="Transportes en tránsito" value={transportesEnTransito} tone="info" /></Link>,
      "alertas": <Link to="/dashboard" hash="atencion-requerida" aria-label="Ver alertas activas" className="block h-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={AlertTriangle} label="Alertas activas" value={isLoadingReminders ? null : reminders.length} tone="danger" /></Link>,
      }} orden={ordenKpi.orden} onCambiar={ordenKpi.cambiar} />

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

type GroupDef = { key: GrupoAlertaId; label: string; emoji: string; kinds: ReminderKind[] };

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

/**
 * «Novedades relevantes»: últimos 7 días no vistas por el usuario. Por defecto
 * solo relevancia Alta; cada usuario puede incluir también Media.
 */
function useNovedadesPanel() {
  const qc = useQueryClient();
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
    staleTime: Infinity,
  });
  const queryKey = ["novedades-panel", userId];
  const consulta = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () => obtenerNovedadesPanel(supabase, userId!),
    refetchInterval: 10 * 60_000,
  });
  const clavePreferencia = ["preferencia-usuario", CLAVE_NOVEDADES_INCLUIR_MEDIA, userId];
  const { data: incluirMedia = false } = useQuery({
    queryKey: clavePreferencia,
    enabled: !!userId,
    queryFn: () => leerIncluirMedia(supabase, userId!),
    staleTime: Infinity,
  });
  const cambiarIncluirMedia = useMutation({
    mutationFn: (valor: boolean) => guardarIncluirMedia(supabase, userId!, valor),
    onMutate: (valor) => {
      const anterior = qc.getQueryData<boolean>(clavePreferencia);
      qc.setQueryData(clavePreferencia, valor);
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(clavePreferencia, ctx?.anterior ?? false);
      toast.error("No se pudo guardar la preferencia de relevancia");
    },
  });
  const marcarVistas = async (ids: string[]) => {
    if (!userId || ids.length === 0) return;
    const anterior = qc.getQueryData<NovedadPanel[]>(queryKey);
    qc.setQueryData<NovedadPanel[]>(queryKey, (l) => (l ?? []).filter((n) => !ids.includes(n.id)));
    try {
      await marcarNovedadesVistas(supabase, userId, ids);
    } catch {
      qc.setQueryData(queryKey, anterior);
      toast.error(ids.length > 1 ? "No se pudieron marcar las novedades como vistas" : "No se pudo marcar la novedad como vista");
    }
  };
  const todas = consulta.data ?? [];
  const novedades = filtrarNovedadesPanel(todas, incluirMedia);
  return {
    /** Las que se muestran y cuentan (Alta, o Alta + Media). */
    novedades,
    /** Media pendientes que quedan ocultas mientras no se incluyan. */
    mediaOcultas: incluirMedia ? 0 : todas.filter((n) => n.relevancia === "Media").length,
    incluirMedia,
    setIncluirMedia: (v: boolean) => { if (userId) cambiarIncluirMedia.mutate(v); },
    isLoading: consulta.isLoading,
    isError: consulta.isError,
    marcarVistas,
  };
}

/** Correos con error de recepción y documentos nuevos llegados por correo a Expedientes. */
function useAlertasCorreo() {
  const qc = useQueryClient();
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
    staleTime: Infinity,
  });
  const queryKey = ["alertas-correo"];
  const consulta = useQuery({ queryKey, queryFn: () => obtenerAlertasCorreo(supabase), refetchInterval: 5 * 60_000 });
  const marcarVistas = async (ids: string[]) => {
    if (!userId || ids.length === 0) return;
    const anterior = qc.getQueryData(queryKey);
    qc.setQueryData<{ errores: CorreoRecibido[]; documentos: CorreoRecibido[] }>(queryKey, (d) => d && ({
      errores: d.errores.filter((c) => !ids.includes(c.id)), documentos: d.documentos.filter((c) => !ids.includes(c.id)),
    }));
    try { await marcarAlertasCorreoVistas(supabase, ids, userId); }
    catch { qc.setQueryData(queryKey, anterior); toast.error("No se pudo marcar como visto"); }
  };
  return { errores: consulta.data?.errores ?? [], documentos: consulta.data?.documentos ?? [], isLoading: consulta.isLoading, isError: consulta.isError, marcarVistas };
}

const fechaHoraPanel = (s: string) => new Date(s).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

function ListaAlertasCorreo({ items, tipo, onVisto }: { items: CorreoRecibido[]; tipo: "error" | "expediente"; onVisto: (ids: string[]) => void }) {
  return (
    <ul className="divide-y border-t">
      {items.map((c) => {
        const pendientes = propuestasPendientes(c.propuestas).length;
        return (
          <li key={c.id} className="px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 hover:bg-muted/40">
            <span className={`h-2 w-2 rounded-full shrink-0 ${tipo === "error" ? "bg-destructive" : "bg-[var(--info)]"}`} />
            <div className="min-w-0 flex-1 basis-[calc(100%-16px)] sm:basis-auto">
              {tipo === "error" ? (
                <Link to="/expedientes/correo" search={{ registro: "error" }} className="text-[13px] font-medium hover:underline break-words">{c.asunto || "(sin asunto)"}</Link>
              ) : (
                <Link to="/expedientes/$id" params={{ id: c.expediente_id! }} search={{ ficha: "checklist" }} className="text-[13px] font-medium hover:underline break-words">
                  {c.expediente_numero} · documentos nuevos por correo
                </Link>
              )}
              <div className="text-xs text-muted-foreground break-words">
                {tipo === "error"
                  ? `${c.remitente_correo ?? c.remitente} · ${correoAtascado(c) ? "El proceso se interrumpió sin terminar" : c.motivo ?? "Error sin detalle"} · ${c.intentos} intento${c.intentos === 1 ? "" : "s"} · ${fechaHoraPanel(c.ultimo_intento_at)}`
                  : `${c.asunto || "(sin asunto)"} · ${c.remitente_correo ?? c.remitente} · ${c.adjuntos_total} adjunto${c.adjuntos_total === 1 ? "" : "s"} · ${fechaHoraPanel(c.created_at)}`}
              </div>
              {pendientes > 0 && <Badge variant="outline" className="mt-1 text-[11px] border-warning/40 text-warning-foreground">{pendientes} dato{pendientes === 1 ? "" : "s"} por confirmar</Badge>}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1 w-[44px] justify-center shrink-0" onClick={() => onVisto([c.id])}>Visto</Button>
          </li>
        );
      })}
    </ul>
  );
}

const RELEVANCIA_CLASE: Record<string, string> = {
  Alta: "bg-destructive/15 text-destructive border-transparent",
  Media: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
};

function RemindersPanel() {
  const { reminders, dismiss, isLoading: cargandoAlertas, isError: errorAlertas } = useAlertasPanel();
  const novedadesPanel = useNovedadesPanel();
  const alertasCorreo = useAlertasCorreo();
  const isLoading = cargandoAlertas || novedadesPanel.isLoading || alertasCorreo.isLoading;
  const isError = errorAlertas || novedadesPanel.isError || alertasCorreo.isError;
  const totalCorreo = alertasCorreo.errores.length + alertasCorreo.documentos.length;
  const total = reminders.length + novedadesPanel.novedades.length + totalCorreo;

  const grouped = REMINDER_GROUPS
    .map((g) => ({ ...g, items: ordenarPorUrgencia(reminders.filter((r) => g.kinds.includes(r.kind))) }))
    .filter((g) => g.items.length > 0);

  const contenidoNovedades = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={novedadesPanel.incluirMedia}
            onCheckedChange={novedadesPanel.setIncluirMedia}
            aria-label="Incluir también relevancia Media"
          />
          Incluir también relevancia Media
          {novedadesPanel.mediaOcultas > 0 && ` (${novedadesPanel.mediaOcultas} oculta${novedadesPanel.mediaOcultas === 1 ? "" : "s"})`}
        </label>
        {novedadesPanel.novedades.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void novedadesPanel.marcarVistas(novedadesPanel.novedades.map((n) => n.id))}
            title="Ocultar de tu Panel todas las novedades mostradas; siguen en la lista de Novedades"
          >
            Marcar todas como vistas ({novedadesPanel.novedades.length})
          </Button>
        )}
      </div>
      {novedadesPanel.novedades.length === 0 && (
        <p className="border-t px-3 py-3 text-xs text-muted-foreground">
          No hay novedades de relevancia Alta pendientes.
        </p>
      )}
      {novedadesPanel.novedades.length > 0 && (
      <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/30 text-[11px] uppercase text-muted-foreground">
        <span className="h-2 w-2 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1" />
        <span className="w-[60px] shrink-0 text-center">Relevancia</span>
        <span className="w-[44px] shrink-0 text-center">Vista</span>
      </div>
      )}
      <ul className="divide-y border-t">
        {novedadesPanel.novedades.map((n) => (
          <li key={n.id} className="px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 hover:bg-muted/40">
            <span className={`h-2 w-2 rounded-full shrink-0 ${n.relevancia === "Alta" ? "bg-destructive" : "bg-[var(--warning)]"}`} />
            <div className="min-w-0 flex-1 basis-[calc(100%-16px)] sm:basis-auto">
              <EnlaceNovedad novedad={n} />
              <div className="text-xs text-muted-foreground break-words">
                {n.fuente_nombre} · {textoFechaNovedad(n.fecha_publicacion, n.fecha_captura)}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {n.impacto && <Badge variant="secondary" className="text-[11px] font-normal">{n.impacto}</Badge>}
                {n.sectores.map((s) => (
                  <Badge key={s} variant="outline" className="text-[11px] font-normal">{s}</Badge>
                ))}
              </div>
            </div>
            <Badge className={`text-[10px] uppercase w-[60px] px-1 justify-center shrink-0 ${RELEVANCIA_CLASE[n.relevancia ?? ""] ?? ""}`}>
              {n.relevancia}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-1 w-[44px] justify-center shrink-0"
              onClick={() => novedadesPanel.marcarVistas([n.id])}
              title="Ocultar del Panel; sigue en la lista de Novedades"
            >
              Vista
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
  // Orden y columna de cada bloque: preferencia del usuario o reparto balanceado automático.
  const disposicion = useDisposicionAlertas();

  // Categorías colapsadas por defecto; se recuerda en el navegador cuáles dejó abiertas.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const guardadas = JSON.parse(window.localStorage.getItem("alertas-panel-expandidas") ?? "[]");
      if (Array.isArray(guardadas)) setAbiertas(new Set(guardadas.filter((k: unknown) => typeof k === "string")));
    } catch { /* valores inválidos: quedan todas colapsadas */ }
  }, []);
  const alternar = (claves: string[], abiertasAqui: string[]) => {
    setAbiertas((prev) => {
      const next = new Set([...prev].filter((k) => !claves.includes(k)));
      abiertasAqui.forEach((k) => next.add(k));
      try { window.localStorage.setItem("alertas-panel-expandidas", JSON.stringify([...next])); } catch { /* sin storage disponible */ }
      return next;
    });
  };

  const contenidoGrupo = (g: (typeof grouped)[number]) => (
    <>
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
                  </>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Bell className="h-4 w-4" /> Atención requerida
        </CardTitle>
        <div className="flex items-center gap-2">
          {disposicion.personalizada && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={disposicion.restablecer} title="Volver a la distribución automática de los bloques">
              Restablecer orden
            </Button>
          )}
          <Badge variant="outline">{total}</Badge>
          {total > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                reminders.forEach((r) => dismiss(r.id));
                void novedadesPanel.marcarVistas(novedadesPanel.novedades.map((n) => n.id));
                void alertasCorreo.marcarVistas([...alertasCorreo.errores, ...alertasCorreo.documentos].map((c) => c.id));
              }}
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
        ) : grouped.length === 0 && novedadesPanel.novedades.length === 0 && novedadesPanel.mediaOcultas === 0 && totalCorreo === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sin alertas pendientes 🎉</div>
        ) : (
          <AlertasColumnasOrdenables
            grupos={{
              ...Object.fromEntries(grouped.map((g) => [g.key, { label: g.label, emoji: g.emoji, cantidad: g.items.length, contenido: contenidoGrupo(g) }])),
              ...(novedadesPanel.novedades.length > 0 || novedadesPanel.mediaOcultas > 0
                ? {
                    novedades: {
                      label: "Novedades relevantes",
                      emoji: "📰",
                      cantidad: novedadesPanel.novedades.length,
                      contenido: contenidoNovedades,
                      // Con Media oculta y sin Alta pendientes, el bloque sigue visible (en 0) para poder incluir Media.
                      mostrarVacio: novedadesPanel.mediaOcultas > 0,
                    },
                  }
                : {}),
              ...(alertasCorreo.errores.length > 0
                ? { "correos-error": { label: "Correos con error de recepción", emoji: "📧", cantidad: alertasCorreo.errores.length,
                    contenido: <ListaAlertasCorreo items={alertasCorreo.errores} tipo="error" onVisto={alertasCorreo.marcarVistas} /> } }
                : {}),
              ...(alertasCorreo.documentos.length > 0
                ? { "correos-expediente": { label: "Documentos nuevos por correo", emoji: "📨", cantidad: alertasCorreo.documentos.length,
                    contenido: <ListaAlertasCorreo items={alertasCorreo.documentos} tipo="expediente" onVisto={alertasCorreo.marcarVistas} /> } }
                : {}),
            }}
            guardada={disposicion.guardada}
            onCambiar={disposicion.cambiar}
            abiertas={abiertas}
            onAlternar={alternar}
          />
        )}
      </CardContent>
    </Card>
  );
}
