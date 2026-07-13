import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dashboard-financiero")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: DashboardFinanciero,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

const fmtRD = (n: number) => `RD$ ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const monthLabel = (d: Date) => d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const parseDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

function DashboardFinanciero() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  // Ventana 12 meses (mes anchor y 11 anteriores)
  const from = new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["dash-financiero", ymKey(anchor)],
    queryFn: async () => {
      const [facRes, gasRes, trRes, opRes] = await Promise.all([
        supabase.from("facturas")
          .select("monto, fecha_emision")
          .is("deleted_at", null)
          .gte("fecha_emision", fromStr).lte("fecha_emision", toStr),
        supabase.from("gastos")
          .select("monto, fecha, es_reembolso")
          .is("deleted_at", null)
          .gte("fecha", fromStr).lte("fecha", toStr),
        supabase.from("transportes")
          .select("costo_viaje, ingreso_facturado, factura_fecha, fecha_salida, eta")
          .is("eliminado_en", null),
        supabase.from("gastos_operativos")
          .select("monto, moneda, fecha, concepto")
          .is("eliminado_en", null)
          .gte("fecha", fromStr).lte("fecha", toStr),
      ]);
      if (facRes.error) throw facRes.error;
      if (gasRes.error) throw gasRes.error;
      if (trRes.error) throw trRes.error;
      if (opRes.error) throw opRes.error;
      return {
        facturas: facRes.data ?? [],
        gastos: gasRes.data ?? [],
        transportes: trRes.data ?? [],
        opex: opRes.data ?? [],
      };
    },
  });

  const view = useMemo(() => {
    // Buckets por mes (12 meses)
    const months: { key: string; label: string; date: Date }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - 11 + i, 1);
      months.push({ key: ymKey(d), label: monthLabel(d), date: d });
    }
    const zero = () => Object.fromEntries(months.map(m => [m.key, 0])) as Record<string, number>;

    const ingresosExp = zero();
    const ingresosTr = zero();
    const costosExp = zero();
    const costosTr = zero();
    const opex = zero();

    for (const f of data?.facturas ?? []) {
      const d = parseDate((f as any).fecha_emision);
      if (!d) continue;
      const k = ymKey(d);
      if (k in ingresosExp) ingresosExp[k] += Number((f as any).monto || 0);
    }
    for (const g of data?.gastos ?? []) {
      if ((g as any).es_reembolso) continue; // reembolsables no son costo del negocio
      const d = parseDate((g as any).fecha);
      if (!d) continue;
      const k = ymKey(d);
      if (k in costosExp) costosExp[k] += Number((g as any).monto || 0);
    }
    for (const t of data?.transportes ?? []) {
      // Ingreso: fecha_factura, luego fecha_salida como fallback
      const dIng = parseDate((t as any).factura_fecha) ?? parseDate((t as any).fecha_salida) ?? parseDate((t as any).eta);
      if (dIng) {
        const k = ymKey(dIng);
        if (k in ingresosTr) ingresosTr[k] += Number((t as any).ingreso_facturado || 0);
      }
      // Costo: usa costo_viaje COMPLETO (NO descuenta CxC)
      const dCosto = parseDate((t as any).fecha_salida) ?? parseDate((t as any).eta) ?? parseDate((t as any).factura_fecha);
      if (dCosto) {
        const k = ymKey(dCosto);
        if (k in costosTr) costosTr[k] += Number((t as any).costo_viaje || 0);
      }
    }
    for (const o of data?.opex ?? []) {
      const d = parseDate((o as any).fecha);
      if (!d) continue;
      const k = ymKey(d);
      // Convertimos monotonía: por simplicidad, todo se agrega en su valor bruto (misma convención que otros dashboards)
      if (k in opex) opex[k] += Number((o as any).monto || 0);
    }

    const serie = months.map(m => {
      const ing = ingresosExp[m.key] + ingresosTr[m.key];
      const costoDir = costosExp[m.key] + costosTr[m.key];
      const opx = opex[m.key];
      const utilBruta = ing - costoDir;
      const utilNeta = utilBruta - opx;
      const margen = ing > 0 ? (utilNeta / ing) * 100 : 0;
      return {
        key: m.key, label: m.label,
        ingresos: ing, costosDir: costoDir, opex: opx, utilBruta, utilNeta, margen,
        ingresosExp: ingresosExp[m.key], ingresosTr: ingresosTr[m.key],
        costosExp: costosExp[m.key], costosTr: costosTr[m.key],
      };
    });

    const curKey = ymKey(anchor);
    const cur = serie.find(s => s.key === curKey) ?? serie[serie.length - 1];
    const prev = serie[serie.indexOf(cur) - 1];

    // Ranking Opex mes actual por concepto
    const opexByConcepto = new Map<string, number>();
    for (const o of data?.opex ?? []) {
      const d = parseDate((o as any).fecha);
      if (!d || ymKey(d) !== curKey) continue;
      const c = (o as any).concepto || "—";
      opexByConcepto.set(c, (opexByConcepto.get(c) ?? 0) + Number((o as any).monto || 0));
    }
    const opexRanking = Array.from(opexByConcepto.entries())
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);

    return { serie, cur, prev, opexRanking };
  }, [data, anchor]);

  const delta = (curV: number, prevV: number) => {
    if (!prevV) return null;
    return ((curV - prevV) / Math.abs(prevV)) * 100;
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Financiero General</h1>
            <p className="text-sm text-muted-foreground">
              Rentabilidad NETA consolidada: Expedientes + Transporte − Gastos Operativos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-medium w-40 text-center capitalize">
              {anchor.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4 text-sm text-muted-foreground flex gap-2">
            <Info className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
            <span>
              <strong className="text-foreground">Regla clave:</strong> los "Costos de Transporte" usan el
              <strong> Costo del Viaje completo</strong> (no el Neto a Pagar). El
              <em> Descuento por CxC</em> es una compensación de cobranza y no reduce el costo real.
            </span>
          </CardContent>
        </Card>

        {/* KPIs mes actual */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard title="Ingresos totales" value={fmtRD(view.cur?.ingresos ?? 0)} delta={delta(view.cur?.ingresos ?? 0, view.prev?.ingresos ?? 0)} />
          <KpiCard title="Costos directos" value={fmtRD(view.cur?.costosDir ?? 0)} delta={delta(view.cur?.costosDir ?? 0, view.prev?.costosDir ?? 0)} invert />
          <KpiCard title="Gastos operativos" value={fmtRD(view.cur?.opex ?? 0)} delta={delta(view.cur?.opex ?? 0, view.prev?.opex ?? 0)} invert />
          <KpiCard title="Utilidad neta" value={fmtRD(view.cur?.utilNeta ?? 0)} delta={delta(view.cur?.utilNeta ?? 0, view.prev?.utilNeta ?? 0)} />
          <KpiCard title="Margen neto" value={fmtPct(view.cur?.margen ?? 0)} delta={delta(view.cur?.margen ?? 0, view.prev?.margen ?? 0)} />
        </div>

        {/* Estado de resultados */}
        <Card>
          <CardHeader><CardTitle>Estado de resultados · {anchor.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <Line2 label="Ingresos Expedientes (facturación)" value={view.cur?.ingresosExp ?? 0} />
                <Line2 label="Ingresos Transporte (facturado)" value={view.cur?.ingresosTr ?? 0} />
                <Line2 label="Ingresos totales" value={view.cur?.ingresos ?? 0} bold divider />
                <Line2 label="(−) Costos directos · Expedientes (gastos no reembolsables)" value={-(view.cur?.costosExp ?? 0)} />
                <Line2 label="(−) Costos directos · Transporte (Costo del Viaje completo)" value={-(view.cur?.costosTr ?? 0)} />
                <Line2 label="Utilidad bruta" value={view.cur?.utilBruta ?? 0} bold divider />
                <Line2 label="(−) Gastos operativos del negocio" value={-(view.cur?.opex ?? 0)} />
                <Line2 label="Utilidad NETA real" value={view.cur?.utilNeta ?? 0} bold highlight />
                <tr><td className="pt-2 text-muted-foreground">Margen neto real</td><td className="pt-2 text-right font-semibold">{fmtPct(view.cur?.margen ?? 0)}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Gráficos 12 meses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Ingresos vs Costos vs Opex (12 meses)</CardTitle></CardHeader>
            <CardContent style={{ height: 300 }}>
              {isLoading ? "Cargando…" : (
                <ResponsiveContainer>
                  <BarChart data={view.serie}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmtRD(Number(v))} />
                    <Legend />
                    <Bar dataKey="ingresos" name="Ingresos" fill="hsl(var(--primary))" />
                    <Bar dataKey="costosDir" name="Costos directos" fill="hsl(var(--destructive))" />
                    <Bar dataKey="opex" name="Gastos operativos" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Utilidad neta y margen (12 meses)</CardTitle></CardHeader>
            <CardContent style={{ height: 300 }}>
              {isLoading ? "Cargando…" : (
                <ResponsiveContainer>
                  <LineChart data={view.serie}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <Tooltip formatter={(v: any, n: any) => n === "Margen %" ? `${Number(v).toFixed(1)}%` : fmtRD(Number(v))} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="utilNeta" name="Utilidad neta" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="margen" name="Margen %" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ranking Opex */}
        <Card>
          <CardHeader><CardTitle>Gastos operativos por concepto · mes actual</CardTitle></CardHeader>
          <CardContent>
            {view.opexRanking.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sin gastos operativos registrados este mes.</div>
            ) : (
              <div className="space-y-2">
                {view.opexRanking.map(r => {
                  const total = view.opexRanking.reduce((s, x) => s + x.monto, 0) || 1;
                  const pct = (r.monto / total) * 100;
                  return (
                    <div key={r.concepto}>
                      <div className="flex justify-between text-sm">
                        <span>{r.concepto}</span>
                        <span className="font-medium">{fmtRD(r.monto)} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function KpiCard({ title, value, delta, invert }: { title: string; value: string; delta: number | null; invert?: boolean }) {
  const good = delta == null ? null : invert ? delta < 0 : delta > 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      {delta != null && (
        <CardContent className="pt-0">
          <Badge variant={good ? "default" : "secondary"} className={good ? "bg-emerald-600 hover:bg-emerald-600" : "bg-muted text-muted-foreground"}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toFixed(1)}% vs mes anterior
          </Badge>
        </CardContent>
      )}
    </Card>
  );
}

function Line2({ label, value, bold, divider, highlight }: { label: string; value: number; bold?: boolean; divider?: boolean; highlight?: boolean }) {
  return (
    <tr className={divider ? "border-t" : ""}>
      <td className={`py-1.5 ${bold ? "font-semibold" : ""} ${highlight ? "text-primary" : ""}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${bold ? "font-semibold" : ""} ${highlight ? "text-primary" : ""}`}>{fmtRD(value)}</td>
    </tr>
  );
}
