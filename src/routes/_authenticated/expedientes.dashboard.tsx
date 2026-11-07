import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate } from "@/lib/dates";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, FolderKanban, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, Percent, Minus, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { FilaRecuadrosOrdenable, useOrdenPreferencia } from "@/components/orden-arrastrable";
import {
  CLAVE_KPI_DASH_IMPORTACIONES, KPI_DASH_IMPORTACIONES_IDS, cubetasSerie, enRango, fechaSantoDomingo,
  lunesIso, periodoComparado, resumenImportaciones, semanaIso, sumarDias, variacionPct,
  type KpiDashImportacionesId, type PeriodoImportaciones, type Rango,
} from "@/lib/importaciones-dashboard";

export const Route = createFileRoute("/_authenticated/expedientes/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard General · Importaciones | ADECOMEX" },
      { name: "description", content: "Volumen de importaciones, facturado, gastos, utilidad y margen por semana, mes o año." },
      { property: "og:title", content: "Dashboard General · Importaciones | ADECOMEX" },
      { property: "og:description", content: "Volumen de importaciones, facturado, gastos, utilidad y margen por semana, mes o año." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpedientesDashboard,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error)?.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">No disponible</div>,
});

const fmtRD = (n: number) => `RD$ ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const isImport = (t: string | null) => !!t && t.toLowerCase().startsWith("importa");
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aFecha = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const diaMes = (s: string) => aFecha(s).toLocaleDateString("es-DO", { day: "numeric", month: "short" });
const fmtRango = (r: Rango) => r.desde === r.hasta ? `${diaMes(r.desde)} ${r.desde.slice(0, 4)}` : `${diaMes(r.desde)} – ${diaMes(r.hasta)} ${r.hasta.slice(0, 4)}`;
const mesLargo = (s: string) => aFecha(s).toLocaleDateString("es-DO", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

const ETIQUETAS_KPI: Record<KpiDashImportacionesId, string> = {
  importaciones: "Importaciones", facturado: "Facturado", gastos: "Gastos", utilidad: "Utilidad", margen: "Margen %",
};
const NOMBRE_ANTERIOR: Record<PeriodoImportaciones, string> = { semanal: "semana anterior", mensual: "mes anterior", anual: "año anterior" };

function ExpedientesDashboard() {
  const [periodo, setPeriodo] = useState<PeriodoImportaciones>("mensual");
  const [anchor, setAnchor] = useState<Date>(() => aFecha(fechaSantoDomingo(new Date())));
  const ordenKpi = useOrdenPreferencia(CLAVE_KPI_DASH_IMPORTACIONES, KPI_DASH_IMPORTACIONES_IDS, "No se pudo guardar el orden de los recuadros");

  const hoy = fechaSantoDomingo(new Date());
  const ancla = isoLocal(anchor);
  const comp = useMemo(() => periodoComparado(periodo, ancla, hoy), [periodo, ancla, hoy]);
  const cubetas = useMemo(() => cubetasSerie(periodo, ancla), [periodo, ancla]);

  const etiquetaPeriodo = periodo === "semanal"
    ? `Sem ${semanaIso(lunesIso(ancla))} · ${fmtRango({ desde: lunesIso(ancla), hasta: sumarDias(lunesIso(ancla), 6) })}`
    : periodo === "anual" ? `Año ${ancla.slice(0, 4)}` : mesLargo(ancla);
  const etiquetaComparacion = comp.aLaFecha
    ? `${fmtRango(comp.actual)} vs. ${fmtRango(comp.previo)} (mismo avance del período)`
    : `vs. ${NOMBRE_ANTERIOR[periodo]} (${fmtRango(comp.previo)})`;
  const tituloSerie = periodo === "semanal" ? "Importaciones por semana (últimas 12)"
    : periodo === "anual" ? `Importaciones por mes · ${ancla.slice(0, 4)}` : "Importaciones por mes (últimos 12)";
  const sufijoRanking = periodo === "semanal" ? "semana" : periodo === "anual" ? "año" : "mes";

  // Todos los Expedientes de importación vigentes (el período se filtra en pantalla).
  const { data, isLoading } = useQuery({
    queryKey: ["exp-dashboard-importaciones"],
    queryFn: async () => {
      const [expRes, facRes, gasRes, cliRes] = await Promise.all([
        supabase.from("expedientes")
          .select("id, numero, tipo_operacion, estado, cliente_id, created_at, total_cif")
          .is("eliminado_en", null),
        supabase.from("facturas")
          .select("expediente_id, monto, estado, fecha_emision")
          .is("deleted_at", null),
        supabase.from("gastos")
          .select("expediente_id, monto, es_reembolso, fecha")
          .is("deleted_at", null),
        supabase.from("clientes").select("id, nombre"),
      ]);
      if (expRes.error) throw expRes.error;
      if (facRes.error) throw facRes.error;
      if (gasRes.error) throw gasRes.error;
      if (cliRes.error) throw cliRes.error;
      return {
        expedientes: (expRes.data || []).filter((e: any) => isImport(e.tipo_operacion)),
        facturas: facRes.data || [],
        gastos: gasRes.data || [],
        clientes: cliRes.data || [],
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const { expedientes, facturas, gastos, clientes } = data;
    const cliMap = new Map(clientes.map((c: any) => [c.id, c.nombre]));
    const expIds = new Set(expedientes.map((e: any) => e.id));

    const facByExp = new Map<string, number>();
    for (const f of facturas) {
      if (!expIds.has(f.expediente_id)) continue;
      facByExp.set(f.expediente_id, (facByExp.get(f.expediente_id) || 0) + Number(f.monto || 0));
    }
    const gasByExp = new Map<string, number>();
    for (const g of gastos) {
      if (!expIds.has(g.expediente_id)) continue;
      if (g.es_reembolso) continue;
      gasByExp.set(g.expediente_id, (gasByExp.get(g.expediente_id) || 0) + Number(g.monto || 0));
    }

    const cur = resumenImportaciones(expedientes, facByExp, gasByExp, comp.actual);
    const prev = resumenImportaciones(expedientes, facByExp, gasByExp, comp.previo);

    const series = cubetas.map((c) => {
      const r = resumenImportaciones(expedientes, facByExp, gasByExp, c.rango);
      return { mes: c.label, cantidad: r.cantidad, facturado: r.facturado, gastos: r.gastos, utilidad: r.utilidad, margen: Number(r.margen.toFixed(1)) };
    });

    // Ranking de rentabilidad del período elegido
    const rentList = expedientes
      .filter((e: any) => enRango(fechaSantoDomingo(e.created_at), comp.actual))
      .map((e: any) => {
        const f = facByExp.get(e.id) || 0;
        const g = gasByExp.get(e.id) || 0;
        const util = f - g;
        const margen = f > 0 ? (util / f) * 100 : 0;
        return {
          id: e.id, numero: e.numero, cliente: cliMap.get(e.cliente_id) || "—",
          facturado: f, gastos: g, utilidad: util, margen,
        };
      })
      .filter((r: any) => r.facturado > 0 || r.gastos > 0);
    const topRent = [...rentList].sort((a, b) => b.utilidad - a.utilidad).slice(0, 5);
    const bottomRent = [...rentList].sort((a, b) => a.utilidad - b.utilidad).slice(0, 5);

    // Cuentas por cobrar (facturas pendientes de expedientes de importación)
    const pendByCli = new Map<string, { cliente: string; monto: number; expedientes: Set<string>; diasMax: number }>();
    const expInfo = new Map(expedientes.map((e: any) => [e.id, e]));
    const now = Date.now();
    for (const f of facturas) {
      if (!expIds.has(f.expediente_id)) continue;
      const est = (f.estado || "").toLowerCase();
      if (est === "pagada" || est === "cancelada") continue;
      const exp: any = expInfo.get(f.expediente_id);
      if (!exp) continue;
      const cliId = exp.cliente_id || "sin";
      const nombre = cliMap.get(cliId) || "Sin cliente";
      const dias = f.fecha_emision ? Math.floor((now - parseLocalDate(f.fecha_emision).getTime()) / 86400000) : 0;
      const acc = pendByCli.get(cliId) || { cliente: nombre, monto: 0, expedientes: new Set<string>(), diasMax: 0 };
      acc.monto += Number(f.monto || 0);
      acc.expedientes.add(exp.numero);
      acc.diasMax = Math.max(acc.diasMax, dias);
      pendByCli.set(cliId, acc);
    }
    const cxc = Array.from(pendByCli.values())
      .map(x => ({ cliente: x.cliente, monto: x.monto, count: x.expedientes.size, diasMax: x.diasMax }))
      .sort((a, b) => b.monto - a.monto);
    const cxcTotal = cxc.reduce((s, x) => s + x.monto, 0);

    return {
      kpis: {
        ...cur,
        dCant: variacionPct(cur.cantidad, prev.cantidad), dFac: variacionPct(cur.facturado, prev.facturado),
        dGas: variacionPct(cur.gastos, prev.gastos), dUtil: variacionPct(cur.utilidad, prev.utilidad),
        dMar: prev.facturado > 0 ? cur.margen - prev.margen : null,
      },
      series, topRent, bottomRent, cxc, cxcTotal,
    };
  }, [data, comp, cubetas]);

  const mover = (dir: 1 | -1) => setAnchor((a) =>
    periodo === "semanal" ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * dir)
      : periodo === "anual" ? new Date(a.getFullYear() + dir, a.getMonth(), 1)
        : new Date(a.getFullYear(), a.getMonth() + dir, 1));

  return (
    <>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard General · Importaciones</h1>
            <p className="text-sm text-muted-foreground">Volumen y rentabilidad del negocio por semana, mes o año</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoImportaciones)}>
              <TabsList>
                <TabsTrigger value="semanal">Semanal</TabsTrigger>
                <TabsTrigger value="mensual">Mensual</TabsTrigger>
                <TabsTrigger value="anual">Anual</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[200px] text-center">
              <div className="font-medium">{etiquetaPeriodo}</div>
              <div className="text-[11px] text-muted-foreground">{etiquetaComparacion}</div>
            </div>
            <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Período siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(aFecha(fechaSantoDomingo(new Date())))}>Hoy</Button>
          </div>
        </div>

        {isLoading || !view ? (
          <div className="text-muted-foreground">Cargando…</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="space-y-2">
            {ordenKpi.personalizado && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={ordenKpi.restablecer}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restablecer orden
                </Button>
              </div>
            )}
            <FilaRecuadrosOrdenable
              ariaLabel="Resumen del período"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
              orden={ordenKpi.orden}
              onMover={ordenKpi.mover}
              etiquetas={ETIQUETAS_KPI}
              recuadros={{
                importaciones: <KpiCard icon={<FolderKanban className="h-4 w-4" />} label="Importaciones" value={String(view.kpis.cantidad)} delta={view.kpis.dCant} />,
                facturado: <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Facturado" value={fmtRD(view.kpis.facturado)} delta={view.kpis.dFac} />,
                gastos: <KpiCard icon={<TrendingDown className="h-4 w-4" />} label="Gastos" value={fmtRD(view.kpis.gastos)} delta={view.kpis.dGas} invert />,
                utilidad: <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Utilidad" value={fmtRD(view.kpis.utilidad)} delta={view.kpis.dUtil} />,
                margen: <KpiCard icon={<Percent className="h-4 w-4" />} label="Margen %" value={fmtPct(view.kpis.margen)} delta={view.kpis.dMar} suffix="pp" />,
              } satisfies Record<KpiDashImportacionesId, React.ReactNode>}
            />
            </div>

            {/* Cantidad de importaciones */}
            <Card>
              <CardHeader><CardTitle>{tituloSerie}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={view.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                      <Bar dataKey="cantidad" fill="var(--primary)" name="Expedientes" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Cada Expediente cuenta en la fecha en que se registró en la plataforma (hora de Santo Domingo).
                </p>
              </CardContent>
            </Card>

            {/* Facturado vs Gastos */}
            <Card>
              <CardHeader><CardTitle>Facturado vs Gastos (RD$)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={view.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip formatter={(v: any) => fmtRD(Number(v))} cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                      <Legend />
                      <Bar dataKey="facturado" fill="var(--primary)" name="Facturado" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="gastos" fill="var(--destructive)" name="Gastos" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Margen % */}
            <Card>
              <CardHeader><CardTitle>Evolución del margen %</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={view.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis tickFormatter={(v) => `${v}%`} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                      <Line type="monotone" dataKey="margen" stroke="var(--primary)" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RentTable title={`Top 5 más rentables (${sufijoRanking})`} rows={view.topRent} vacio={`Sin datos en ${sufijoRanking === "semana" ? "la" : "el"} ${sufijoRanking}.`} />
              <RentTable title={`Top 5 menos rentables (${sufijoRanking})`} rows={view.bottomRent} vacio={`Sin datos en ${sufijoRanking === "semana" ? "la" : "el"} ${sufijoRanking}.`} />
            </div>

            {/* Cuentas por cobrar */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
                  Cuentas por cobrar
                </CardTitle>
                <Badge variant="secondary" className="text-base">{fmtRD(view.cxcTotal)}</Badge>
              </CardHeader>
              <CardContent>
                {view.cxc.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin facturas pendientes.</div>
                ) : (
                  <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-sm">
                      <thead className="sticky-table-header">
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-2">Cliente</th>
                          <th className="py-2">Expedientes</th>
                          <th className="py-2 text-right">Monto pendiente</th>
                          <th className="py-2 text-right">Antigüedad máx.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.cxc.map((r, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 font-medium">{r.cliente}</td>
                            <td className="py-2">{r.count}</td>
                            <td className="py-2 text-right">{fmtRD(r.monto)}</td>
                            <td className="py-2 text-right">
                              <Badge variant={r.diasMax > 60 ? "destructive" : r.diasMax > 30 ? "secondary" : "outline"}>
                                {r.diasMax} días
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function KpiCard({ icon, label, value, delta, invert, suffix }: {
  icon: React.ReactNode; label: string; value: string; delta: number | null; invert?: boolean; suffix?: string;
}) {
  const good = delta != null && (invert ? delta < 0 : delta > 0);
  const neutral = delta == null || delta === 0;
  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 pr-5 text-muted-foreground text-xs mb-2">
          {icon}<span>{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className={`text-xs mt-1 ${neutral ? "text-muted-foreground" : good ? "text-[var(--success)]" : "text-destructive"}`}>
          {delta == null ? (
            <span className="inline-flex items-center gap-1" title="El período anterior no tiene datos para comparar"><Minus className="h-3 w-3" /> sin base</span>
          ) : delta === 0 ? "Sin cambio" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}${suffix || "%"}`}
        </div>
      </CardContent>
    </Card>
  );
}

function RentTable({ title, rows, vacio }: {
  title: string;
  rows: Array<{ id: string; numero: string; cliente: string; facturado: number; gastos: number; utilidad: number; margen: number }>;
  vacio: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">{vacio}</div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky-table-header">
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2">Expediente</th>
                  <th className="py-2">Cliente</th>
                  <th className="py-2 text-right">Utilidad</th>
                  <th className="py-2 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 expediente-numero">{r.numero}</td>
                    <td className="py-2">{r.cliente}</td>
                    <td className={`py-2 text-right ${r.utilidad >= 0 ? "text-[var(--success)]" : "text-destructive"}`}>{fmtRD(r.utilidad)}</td>
                    <td className="py-2 text-right">{fmtPct(r.margen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
