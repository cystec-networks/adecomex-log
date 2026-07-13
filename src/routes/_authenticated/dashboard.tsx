import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Inbox, FolderKanban, CheckCircle2, Clock, FileWarning, TrendingUp, Bell, Truck } from "lucide-react";
import { useReminders } from "@/lib/reminders";
import { daysFromToday, parseLocalDate } from "@/lib/dates";

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
    <Card>
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
      const [sol, exp, inc, docs, per, tra] = await Promise.all([
        supabase.from("solicitudes").select("id,numero,estado,prioridad,created_at").is("eliminado_en", null),
        supabase.from("expedientes").select("id,numero,estado,etapa_actual,fecha_compromiso,created_at,updated_at").is("eliminado_en", null),
        supabase.from("incidencias").select("id,estado,severidad"),
        supabase.from("documentos").select("id,estado,fecha_vencimiento"),
        supabase.from("permisos").select("id,estado,fecha_vencimiento").is("eliminado_en", null),
        supabase.from("transportes").select("id,estado,eta").is("eliminado_en", null),
      ]);
      return {
        solicitudes: sol.data ?? [],
        expedientes: exp.data ?? [],
        incidencias: inc.data ?? [],
        documentos: docs.data ?? [],
        permisos: per.data ?? [],
        transportes: tra.data ?? [],
      };
    },
  });

  const { visible: reminders } = useReminders();

  const solicitudesActivas = stats?.solicitudes.filter((s) => s.estado !== "rechazada").length ?? 0;
  const expedientesEnProceso = stats?.expedientes.filter((e) => e.estado === "digitar" || e.estado === "presentar" || e.estado === "verificar" || e.estado === "facturar").length ?? 0;
  const expedientesCerrados = stats?.expedientes.filter((e) => e.estado === "despachado").length ?? 0;
  const incidenciasAbiertas = stats?.incidencias.filter((i) => i.estado !== "cerrada" && i.estado !== "resuelta").length ?? 0;
  const urgentes = stats?.solicitudes.filter((s) => s.prioridad === "urgente" || s.prioridad === "alta").length ?? 0;
  const docsVencidos = stats?.documentos.filter((d) => d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date()).length ?? 0;
  const permisosPorVencer = stats?.permisos.filter((p) => {
    if (!p.fecha_vencimiento || p.estado === "rechazado" || p.estado === "vencido") return false;
    const d = (new Date(p.fecha_vencimiento).getTime() - Date.now()) / 86400000;
    return d >= 0 && d <= 15;
  }).length ?? 0;
  const transportesEnTransito = stats?.transportes.filter((t) => t.estado === "en_transito" || t.estado === "programado").length ?? 0;

  const ultimasSol = [...(stats?.solicitudes ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);
  const ultimosExp = [...(stats?.expedientes ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold">Panel de operaciones</h1>
        <p className="text-sm text-muted-foreground">Estado general de solicitudes, expedientes y alertas críticas.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPI icon={Inbox} label="SOLICITUDES RECIBIDAS" value={solicitudesActivas} tone="primary" />
        <KPI icon={FolderKanban} label="EXPEDIENTES EN PROCESOS" value={expedientesEnProceso} tone="info" />
        <KPI icon={CheckCircle2} label="DESPACHADOS" value={expedientesCerrados} tone="success" />
        <KPI icon={FileWarning} label="Permisos por vencer" value={permisosPorVencer} tone="warning" sub="Próximos 15 días" />
        <KPI icon={Truck} label="Transportes en tránsito" value={transportesEnTransito} tone="info" />
        <KPI icon={AlertTriangle} label="Alertas activas" value={reminders.length} tone="danger" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Bell className="h-4 w-4" /> Atención requerida
          </CardTitle>
          <Badge variant="outline">{reminders.length}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {reminders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin alertas pendientes</div>
          ) : (
            <ul className="divide-y">
              {reminders.slice(0, 8).map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40">
                  <span className={`h-2 w-2 rounded-full ${r.severity === "critica" ? "bg-destructive" : r.severity === "alta" ? "bg-[var(--warning)]" : "bg-[var(--info)]"}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={r.href} className="text-sm font-medium hover:underline block truncate">{r.title}</Link>
                    <div className="text-xs text-muted-foreground truncate">{r.detail}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">{r.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Últimas solicitudes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr><th className="text-left px-4 py-2">Solicitud</th><th className="text-left">Estado</th><th className="text-left">Prioridad</th><th /></tr>
              </thead>
              <tbody>
                {ultimasSol.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">
                      <Link to="/solicitudes/$id" params={{ id: s.id }} className="hover:underline">{s.numero ?? s.id.slice(0, 8)}</Link>
                    </td>
                    <td><EstadoBadge value={s.estado} /></td>
                    <td><PrioridadBadge value={s.prioridad} /></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground text-right">{new Date(s.created_at).toLocaleDateString("es-DO")}</td>
                  </tr>
                ))}
                {ultimasSol.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin solicitudes registradas</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2"><TrendingUp className="h-4 w-4" />Últimos expedientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr><th className="text-left px-4 py-2">Expediente</th><th className="text-left">Estado</th><th className="text-left">Etapa</th><th /></tr>
              </thead>
              <tbody>
                {ultimosExp.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">
                      <Link to="/expedientes/$id" params={{ id: e.id }} className="hover:underline">{e.numero ?? e.id.slice(0, 8)}</Link>
                    </td>
                    <td><EstadoBadge value={e.estado} /></td>
                    <td className="text-xs">Etapa {e.etapa_actual}/14</td>
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
    presentar: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
    verificar: "bg-primary/15 text-primary border-transparent",
    facturar: "bg-accent/20 text-accent-foreground border-transparent",
    despachado: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
  };
  return <Badge className={map[value] ?? "bg-muted text-muted-foreground border-transparent"}>{value?.replace("_", " ")}</Badge>;
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
