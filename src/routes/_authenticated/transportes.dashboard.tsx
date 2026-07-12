import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Truck, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/transportes/dashboard")({
  component: TransporteDashboard,
  errorComponent: ({ error }) => (
    <AppShell><div className="p-6 text-destructive">{error.message}</div></AppShell>
  ),
  notFoundComponent: () => <AppShell><div className="p-6">No disponible</div></AppShell>,
});

type Periodo = "semanal" | "mensual";

// ---------- date helpers ----------
function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setDate(x.getDate() + diff);
  return x;
}
function endOfWeek(d: Date) { const x = startOfWeek(d); x.setDate(x.getDate() + 6); x.setHours(23, 59, 59, 999); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function fmtDate(d: Date) { return d.toLocaleDateString("es-DO", { day: "2-digit", month: "short" }); }
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}

const fmtRD = (n: number) => `RD$ ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n >= 0 ? "↑" : "↓"} ${Math.abs(n).toFixed(1)}%`;

const ESTADOS: { key: string; label: string }[] = [
  { key: "programado", label: "Programado" },
  { key: "en_transito", label: "En tránsito" },
  { key: "entregado", label: "Entregado" },
  { key: "facturado", label: "Facturado" },
];

function TransporteDashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("semanal");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [clienteId, setClienteId] = useState<string>("all");
  const [transportista, setTransportista] = useState<string>("all");

  const range = useMemo(() => {
    if (periodo === "semanal") {
      const start = startOfWeek(anchor); const end = endOfWeek(anchor);
      const prevStart = addDays(start, -7); const prevEnd = addDays(end, -7);
      return { start, end, prevStart, prevEnd,
        label: `Sem ${isoWeek(start)} · ${fmtDate(start)} – ${fmtDate(end)}, ${start.getFullYear()}` };
    }
    const start = startOfMonth(anchor); const end = endOfMonth(anchor);
    const prevStart = addMonths(start, -1); const prevEnd = endOfMonth(prevStart);
    return { start, end, prevStart, prevEnd,
      label: start.toLocaleDateString("es-DO", { month: "long", year: "numeric" }).replace(/^./, c => c.toUpperCase()) };
  }, [periodo, anchor]);

  const { data: clientes } = useQuery({
    queryKey: ["dash-tr-clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  // Get all non-deleted transportes in a window (12 periods back for trend)
  const trendWindowStart = useMemo(() => {
    if (periodo === "semanal") return addDays(range.start, -7 * 7); // 8 semanas
    return addMonths(range.start, -5); // 6 meses
  }, [periodo, range.start]);

  const { data: rows } = useQuery({
    queryKey: ["dash-tr-rows", trendWindowStart.toISOString(), range.end.toISOString(), clienteId, transportista],
    queryFn: async () => {
      let q = supabase.from("transportes")
        .select("id,estado,tipo,cliente_id,transportista,contenedores_cantidad,fecha_salida,eta,created_at,ingreso_facturado,costo_viaje,costo_combustible,costo_peajes,costo_chofer,costo_otros,pago_estado,descuento_cxc,flete_monto")
        .is("eliminado_en", null)
        .eq("tipo", "terrestre" as any);
      if (clienteId !== "all") q = q.eq("cliente_id", clienteId);
      if (transportista !== "all") q = q.eq("transportista", transportista);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const transportistasList = useMemo(() => {
    const s = new Set<string>();
    (rows ?? []).forEach(r => r.transportista && s.add(r.transportista));
    return [...s].sort();
  }, [rows]);

  const getBaseDate = (r: any) => r.fecha_salida ? new Date(r.fecha_salida) : new Date(r.created_at);

  const inRange = (r: any, s: Date, e: Date) => {
    const d = getBaseDate(r);
    return d >= s && d <= e;
  };

  const current = useMemo(() => (rows ?? []).filter(r => inRange(r, range.start, range.end)), [rows, range]);
  const previous = useMemo(() => (rows ?? []).filter(r => inRange(r, range.prevStart, range.prevEnd)), [rows, range]);

  const sum = (arr: any[], f: (r: any) => number) => arr.reduce((a, r) => a + (Number(f(r)) || 0), 0);

  const costOf = (r: any) => (Number(r.costo_viaje) || 0) + (Number(r.costo_combustible) || 0)
    + (Number(r.costo_peajes) || 0) + (Number(r.costo_chofer) || 0) + (Number(r.costo_otros) || 0);
  const ingresoOf = (r: any) => Number(r.ingreso_facturado) || 0;

  const kpis = useMemo(() => {
    const viajes = current.length;
    const contenedores = sum(current, r => r.contenedores_cantidad);
    const ingreso = sum(current, ingresoOf);
    const costo = sum(current, costOf);
    const margenRD = ingreso - costo;
    const margenPct = ingreso > 0 ? (margenRD / ingreso) * 100 : 0;

    const pViajes = previous.length;
    const pCont = sum(previous, r => r.contenedores_cantidad);
    const pIng = sum(previous, ingresoOf);
    const pCosto = sum(previous, costOf);
    const pMargenPct = pIng > 0 ? ((pIng - pCosto) / pIng) * 100 : 0;

    return {
      viajes, contenedores, ingreso, costo, margenRD, margenPct,
      dViajes: pViajes ? ((viajes - pViajes) / pViajes) * 100 : 0,
      dCont: pCont ? ((contenedores - pCont) / pCont) * 100 : 0,
      dIng: pIng ? ((ingreso - pIng) / pIng) * 100 : 0,
      dMargenPP: margenPct - pMargenPct,
    };
  }, [current, previous]);

  const estadosData = useMemo(() =>
    ESTADOS.map(e => ({ ...e, count: current.filter(r => r.estado === e.key).length })),
    [current]);

  const atrasados = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return current.filter(r => r.eta && new Date(r.eta) < today && r.estado !== "entregado" && r.estado !== "facturado").length;
  }, [current]);

  const promedioCont = kpis.viajes > 0 ? (kpis.contenedores / kpis.viajes) : 0;

  const pendienteCobro = useMemo(() =>
    sum(current.filter(r => r.pago_estado === "pendiente"), ingresoOf), [current]);
  const netoPagoTransp = useMemo(() =>
    sum(current, r => (Number(r.costo_viaje) || 0) - (Number(r.descuento_cxc) || 0)), [current]);

  // Trend: cantidad contenedores & margen % por período
  const trend = useMemo(() => {
    const buckets: { label: string; start: Date; end: Date }[] = [];
    if (periodo === "semanal") {
      for (let i = 7; i >= 0; i--) {
        const s = addDays(range.start, -7 * i); const e = addDays(s, 6);
        buckets.push({ label: `S${isoWeek(s)}`, start: s, end: e });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const s = addMonths(range.start, -i); const e = endOfMonth(s);
        buckets.push({ label: s.toLocaleDateString("es-DO", { month: "short" }), start: s, end: e });
      }
    }
    return buckets.map(b => {
      const bucket = (rows ?? []).filter(r => inRange(r, b.start, b.end));
      const ing = sum(bucket, ingresoOf); const cost = sum(bucket, costOf);
      return {
        label: b.label,
        contenedores: sum(bucket, r => r.contenedores_cantidad),
        margen: ing > 0 ? +(((ing - cost) / ing) * 100).toFixed(1) : 0,
      };
    });
  }, [rows, periodo, range.start]);

  const goPrev = () => setAnchor(a => periodo === "semanal" ? addDays(a, -7) : addMonths(a, -1));
  const goNext = () => setAnchor(a => periodo === "semanal" ? addDays(a, 7) : addMonths(a, 1));

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header controls */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[220px] text-center font-semibold">{range.label}</div>
            <Button variant="outline" size="icon" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <TabsList>
                <TabsTrigger value="semanal">Semanal</TabsTrigger>
                <TabsTrigger value="mensual">Mensual</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {(clientes ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={transportista} onValueChange={setTransportista}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Transportista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los transportistas</SelectItem>
                {transportistasList.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resumen ejecutivo */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={<Truck className="h-4 w-4" />} title="Viajes" value={kpis.viajes.toString()} delta={kpis.dViajes} />
          <KpiCard icon={<Package className="h-4 w-4" />} title="Contenedores" value={kpis.contenedores.toString()} delta={kpis.dCont} />
          <KpiCard icon={<DollarSign className="h-4 w-4" />} title="Ingreso Total" value={fmtRD(kpis.ingreso)} delta={kpis.dIng} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} title="Margen" value={`${kpis.margenPct.toFixed(1)}%`} deltaPP={kpis.dMargenPP} />
        </div>

        {/* Estados */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Estados</CardTitle>
            {atrasados > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {atrasados} atrasado{atrasados !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {estadosData.map(e => (
                <div key={e.key} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{e.label}</div>
                  <div className="text-2xl font-semibold">{e.count}</div>
                </div>
              ))}
            </div>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={estadosData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Contenedores */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Contenedores</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Total movilizados</div>
                <div className="text-2xl font-semibold">{kpis.contenedores}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Promedio por viaje</div>
                <div className="text-2xl font-semibold">{promedioCont.toFixed(2)}</div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="contenedores" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Rentabilidad */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Rentabilidad (Terrestre)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Costos" value={fmtRD(kpis.costo)} />
              <MiniStat label="Ingresos" value={fmtRD(kpis.ingreso)} />
              <MiniStat label="Margen RD$" value={fmtRD(kpis.margenRD)} />
              <MiniStat label="Margen %" value={`${kpis.margenPct.toFixed(1)}%`}
                trend={kpis.dMargenPP >= 0 ? "up" : "down"}
                extra={`${kpis.dMargenPP >= 0 ? "↑" : "↓"} ${Math.abs(kpis.dMargenPP).toFixed(1)}pp`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniStat label="Pendiente de cobro (Clientes)" value={fmtRD(pendienteCobro)} tone="warning" />
              <MiniStat label="Neto pendiente a Transportistas" value={fmtRD(netoPagoTransp)} tone="info" />
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="margen" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function KpiCard({ icon, title, value, delta, deltaPP }: { icon: React.ReactNode; title: string; value: string; delta?: number; deltaPP?: number }) {
  const d = deltaPP ?? delta ?? 0;
  const up = d >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">{icon}<span>{title}</span></div>
          {(delta !== undefined || deltaPP !== undefined) && (
            <span className={`flex items-center gap-0.5 ${up ? "text-emerald-600" : "text-red-600"}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {deltaPP !== undefined ? `${Math.abs(d).toFixed(1)}pp` : pct(d)}
            </span>
          )}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, extra, trend, tone }: { label: string; value: string; extra?: string; trend?: "up" | "down"; tone?: "warning" | "info" }) {
  const toneCls = tone === "warning" ? "border-amber-300 bg-amber-50" : tone === "info" ? "border-blue-300 bg-blue-50" : "";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {extra && <div className={`text-xs mt-0.5 ${trend === "up" ? "text-emerald-600" : "text-red-600"}`}>{extra}</div>}
    </div>
  );
}
