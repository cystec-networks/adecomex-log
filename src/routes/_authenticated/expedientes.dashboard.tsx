import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, FolderKanban, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, Percent,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/expedientes/dashboard")({
  component: ExpedientesDashboard,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">No disponible</div>,
});

const fmtRD = (n: number) => `RD$ ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;
const monthLabel = (d: Date) => d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
const isImport = (t: string | null) => !!t && t.toLowerCase().startsWith("importa");

function ExpedientesDashboard() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const from = new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);

  const { data, isLoading } = useQuery({
    queryKey: ["exp-dashboard", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const [expRes, facRes, gasRes, cliRes] = await Promise.all([
        supabase.from("expedientes")
          .select("id, numero, tipo_operacion, estado, cliente_id, created_at, total_cif")
          .is("eliminado_en", null)
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString()),
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

    // Current month
    const curKey = `${anchor.getFullYear()}-${anchor.getMonth()}`;
    const prevAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    const prevKey = `${prevAnchor.getFullYear()}-${prevAnchor.getMonth()}`;
    const monthKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}`; };

    let curCount = 0, prevCount = 0, curFac = 0, prevFac = 0, curGas = 0, prevGas = 0;
    for (const e of expedientes) {
      const k = monthKey(e.created_at);
      const f = facByExp.get(e.id) || 0;
      const g = gasByExp.get(e.id) || 0;
      if (k === curKey) { curCount++; curFac += f; curGas += g; }
      if (k === prevKey) { prevCount++; prevFac += f; prevGas += g; }
    }
    const curUtil = curFac - curGas;
    const prevUtil = prevFac - prevGas;
    const curMargin = curFac > 0 ? (curUtil / curFac) * 100 : 0;
    const prevMargin = prevFac > 0 ? (prevUtil / prevFac) * 100 : 0;
    const delta = (c: number, p: number) => (p === 0 ? (c === 0 ? 0 : 100) : ((c - p) / Math.abs(p)) * 100);

    // 12-month series
    const months: { key: string; label: string; date: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(d), date: d });
    }
    const bucket = new Map<string, { count: number; fac: number; gas: number }>();
    months.forEach(m => bucket.set(m.key, { count: 0, fac: 0, gas: 0 }));
    for (const e of expedientes) {
      const k = monthKey(e.created_at);
      const b = bucket.get(k);
      if (!b) continue;
      b.count++;
      b.fac += facByExp.get(e.id) || 0;
      b.gas += gasByExp.get(e.id) || 0;
    }
    const series = months.map(m => {
      const b = bucket.get(m.key)!;
      const util = b.fac - b.gas;
      const margen = b.fac > 0 ? (util / b.fac) * 100 : 0;
      return { mes: m.label, cantidad: b.count, facturado: b.fac, gastos: b.gas, utilidad: util, margen: Number(margen.toFixed(1)) };
    });

    // Ranking rentabilidad (mes actual)
    const rentList = expedientes
      .filter((e: any) => monthKey(e.created_at) === curKey)
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
      const dias = f.fecha_emision ? Math.floor((now - new Date(f.fecha_emision).getTime()) / 86400000) : 0;
      const cur = pendByCli.get(cliId) || { cliente: nombre, monto: 0, expedientes: new Set<string>(), diasMax: 0 };
      cur.monto += Number(f.monto || 0);
      cur.expedientes.add(exp.numero);
      cur.diasMax = Math.max(cur.diasMax, dias);
      pendByCli.set(cliId, cur);
    }
    const cxc = Array.from(pendByCli.values())
      .map(x => ({ cliente: x.cliente, monto: x.monto, count: x.expedientes.size, diasMax: x.diasMax }))
      .sort((a, b) => b.monto - a.monto);
    const cxcTotal = cxc.reduce((s, x) => s + x.monto, 0);

    return {
      kpis: {
        cantidad: curCount, facturado: curFac, gastos: curGas, utilidad: curUtil, margen: curMargin,
        dCant: delta(curCount, prevCount), dFac: delta(curFac, prevFac),
        dGas: delta(curGas, prevGas), dUtil: delta(curUtil, prevUtil),
        dMar: curMargin - prevMargin,
      },
      series, topRent, bottomRent, cxc, cxcTotal,
    };
  }, [data, anchor]);

  return (
    <>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard General · Importaciones</h1>
            <p className="text-sm text-muted-foreground">Volumen mensual y rentabilidad del negocio</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[160px] text-center font-medium capitalize">
              {anchor.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Hoy</Button>
          </div>
        </div>

        {isLoading || !view ? (
          <div className="text-muted-foreground">Cargando…</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard icon={<FolderKanban className="h-4 w-4" />} label="Importaciones" value={String(view.kpis.cantidad)} delta={view.kpis.dCant} />
              <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Facturado" value={fmtRD(view.kpis.facturado)} delta={view.kpis.dFac} />
              <KpiCard icon={<TrendingDown className="h-4 w-4" />} label="Gastos" value={fmtRD(view.kpis.gastos)} delta={view.kpis.dGas} invert />
              <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Utilidad" value={fmtRD(view.kpis.utilidad)} delta={view.kpis.dUtil} />
              <KpiCard icon={<Percent className="h-4 w-4" />} label="Margen %" value={fmtPct(view.kpis.margen)} delta={view.kpis.dMar} suffix="pp" />
            </div>

            {/* Cantidad de importaciones 12 meses */}
            <Card>
              <CardHeader><CardTitle>Importaciones por mes (últimos 12)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={view.series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="cantidad" fill="hsl(var(--primary))" name="Expedientes" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Facturado vs Gastos */}
            <Card>
              <CardHeader><CardTitle>Facturado vs Gastos (RD$)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={view.series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => fmtRD(Number(v))} />
                      <Legend />
                      <Bar dataKey="facturado" fill="hsl(var(--primary))" name="Facturado" />
                      <Bar dataKey="gastos" fill="hsl(var(--destructive))" name="Gastos" />
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
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                      <Line type="monotone" dataKey="margen" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RentTable title="Top 5 más rentables (mes)" rows={view.topRent} positive />
              <RentTable title="Top 5 menos rentables (mes)" rows={view.bottomRent} />
            </div>

            {/* Cuentas por cobrar */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Cuentas por cobrar
                </CardTitle>
                <Badge variant="secondary" className="text-base">{fmtRD(view.cxcTotal)}</Badge>
              </CardHeader>
              <CardContent>
                {view.cxc.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin facturas pendientes.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
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
  icon: React.ReactNode; label: string; value: string; delta: number; invert?: boolean; suffix?: string;
}) {
  const good = invert ? delta < 0 : delta > 0;
  const neutral = delta === 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          {icon}<span>{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className={`text-xs mt-1 ${neutral ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600"}`}>
          {neutral ? "—" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}${suffix || "%"} vs mes anterior`}
        </div>
      </CardContent>
    </Card>
  );
}

function RentTable({ title, rows, positive }: {
  title: string;
  rows: Array<{ id: string; numero: string; cliente: string; facturado: number; gastos: number; utilidad: number; margen: number }>;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin datos en el mes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
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
                    <td className="py-2 font-medium">{r.numero}</td>
                    <td className="py-2">{r.cliente}</td>
                    <td className={`py-2 text-right ${r.utilidad >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtRD(r.utilidad)}</td>
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
