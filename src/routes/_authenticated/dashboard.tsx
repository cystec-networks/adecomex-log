import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Inbox, FolderKanban, Clock, FileWarning, TrendingUp, Bell, Truck } from "lucide-react";
import { useReminders, type Reminder, type ReminderKind } from "@/lib/reminders";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { daysFromToday } from "@/lib/dates";
import { ESTADO_LABEL } from "@/lib/estados-expediente";
import { cotizacionEstadoLabel, COTIZACION_ESTADO_CLASS } from "@/lib/estados-cotizacion";


export const Route = createFileRoute("/_authenticated/dashboard")({
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
    <Card className="h-full cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-3xl font-display font-bold mt-1">{value ?? "—"}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className={`h-11 w-11 grid place-items-center rounded-lg ${toneMap[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [cot, ord, exp, per, tra] = await Promise.all([
        supabase.from("cotizaciones").select("id,numero,estado,created_at,updated_at,clientes(nombre)").is("eliminado_en", null),
        supabase.from("ordenes").select("id,cotizacion_id").is("eliminado_en", null),
        supabase.from("expedientes").select("id,numero,estado,etapa_actual,fecha_compromiso,created_at").is("eliminado_en", null),
        supabase.from("permisos").select("id,estado,fecha_vencimiento").is("eliminado_en", null),
        supabase.from("transportes").select("id,estado,eta").is("eliminado_en", null),
      ]);
      return {
        cotizaciones: cot.data ?? [],
        ordenes: ord.data ?? [],
        expedientes: exp.data ?? [],
        permisos: per.data ?? [],
        transportes: tra.data ?? [],
      };
    },
  });

  const { visible: reminders } = useReminders();

  const cotizacionesConOrden = new Set(
    (stats?.ordenes ?? []).map((o: any) => o.cotizacion_id).filter(Boolean),
  );
  const cotizacionesSinConvertir = (stats?.cotizaciones ?? []).filter(
    (c: any) => c.estado !== "rechazada" && c.estado !== "expirada" && !cotizacionesConOrden.has(c.id),
  ).length;

  const cotizacionesSinMovimiento = (stats?.cotizaciones ?? []).filter((c: any) => {
    if (c.estado === "rechazada" || c.estado === "expirada") return false;
    if (cotizacionesConOrden.has(c.id)) return false;
    const ref = c.updated_at ?? c.created_at;
    if (!ref) return false;
    return (Date.now() - new Date(ref).getTime()) / 86400000 > 15;
  }).length;

  const expedientesEnProceso = stats?.expedientes.filter((e) => e.estado === "digitar" || e.estado === "en_transito" || e.estado === "presentar" || e.estado === "verificar" || e.estado === "entregado").length ?? 0;
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
      <div>
        <h1 className="font-display text-2xl font-bold">Panel de operaciones</h1>
        <p className="text-sm text-muted-foreground">Estado general de cotizaciones, expedientes y alertas críticas.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link to="/cotizaciones" search={{ sinConvertir: true }} aria-label="Ver cotizaciones sin convertir" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Inbox} label="COTIZACIONES SIN CONVERTIR" value={cotizacionesSinConvertir} tone="primary" sub={cotizacionesSinMovimiento > 0 ? `${cotizacionesSinMovimiento} sin movimiento +15 días` : undefined} /></Link>
        <Link to="/expedientes" search={{ estado: "digitar,en_transito,presentar,verificar,entregado" }} aria-label="Ver expedientes en proceso" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={FolderKanban} label="EXPEDIENTES EN PROCESOS" value={expedientesEnProceso} tone="info" /></Link>
        <Link to="/expedientes" search={{ eta: 7 }} aria-label="Ver expedientes por llegar" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Clock} label="EXPEDIENTES POR LLEGAR" value={expedientesPorLlegar} tone="warning" sub="Próximos 7 días" /></Link>
        <Link to="/permisos" search={{ vencimiento: 15 }} aria-label="Ver permisos VUCE por vencer" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={FileWarning} label="Permisos VUCE por vencer" value={permisosPorVencer} tone="warning" sub="Próximos 15 días" /></Link>
        <Link to="/transportes" search={{ estado: "en_transito,programado" }} aria-label="Ver transportes en tránsito" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={Truck} label="Transportes en tránsito" value={transportesEnTransito} tone="info" /></Link>
        <Link to="/dashboard" hash="atencion-requerida" aria-label="Ver alertas activas" className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><KPI icon={AlertTriangle} label="Alertas activas" value={reminders.length} tone="danger" /></Link>
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
                      <Link to="/expedientes/$id" params={{ id: e.id }} className="hover:underline">{e.numero ?? e.id.slice(0, 8)}</Link>
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


function EstadoBadge({ value }: { value: string }) {
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
  return <Badge className={map[value] ?? "bg-muted text-muted-foreground border-transparent"}>{label}</Badge>;
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
  { key: "eta", label: "ETA / Expedientes", emoji: "🟡", kinds: ["eta_proximo", "expediente_inactivo"] },
  { key: "permisos", label: "Permisos VUCE por vencer", emoji: "🟠", kinds: ["permiso_vencido", "permiso_por_vencer"] },
  { key: "transportes", label: "Transportes retrasados", emoji: "🚚", kinds: ["transporte_retrasado"] },
  { key: "solicitudes", label: "Solicitudes sin convertir", emoji: "📥", kinds: ["solicitud_sin_convertir"] },
];

function RemindersPanel() {
  const { visible: reminders, dismiss } = useReminders();

  const grouped = REMINDER_GROUPS
    .map((g) => ({ ...g, items: reminders.filter((r) => g.kinds.includes(r.kind)) }))
    .filter((g) => g.items.length > 0);

  const defaultOpen = grouped.length > 0 ? [grouped[0].key] : [];

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
        {reminders.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sin alertas pendientes 🎉</div>
        ) : (
          <div className="max-h-[460px] overflow-auto">
            <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
              {grouped.map((g) => (
                <AccordionItem key={g.key} value={g.key} className="border-b last:border-b-0">
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
                    <ul className="divide-y border-t">
                      {g.items.map((r) => (
                        <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              r.severity === "critica"
                                ? "bg-destructive"
                                : r.severity === "alta"
                                ? "bg-[var(--warning)]"
                                : "bg-[var(--info)]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <Link to={r.href} className="text-sm font-medium hover:underline block truncate">
                              {r.title}
                            </Link>
                            <div className="text-xs text-muted-foreground truncate">{r.detail}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {r.severity}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2"
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
