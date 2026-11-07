import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, RotateCcw, Truck, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Minus } from "lucide-react";
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fechaViajePeriodo, gananciaPorTransporte, isoLocal } from "@/lib/transporte-ganancia";
import {
  ESTADOS_DASHBOARD, cobroPorTransporte, estadoDashboard, resumenTransportes, variacionPct,
  type EstadoDashboard, type FacturaCobroTransporte, type ViajeDashboard,
} from "@/lib/transportes-dashboard";
import { BloquesOrdenables, FilaRecuadrosOrdenable, useOrdenPreferencia } from "@/components/orden-arrastrable";
import {
  BLOQUES_DASH_TRANSPORTES_AL_INICIO, BLOQUES_DASH_TRANSPORTES_IDS, CLAVE_BLOQUES_DASH_TRANSPORTES, CLAVE_ESTADOS_DASH_TRANSPORTES, CLAVE_KPI_DASH_TRANSPORTES,
  ESTADOS_DASH_TRANSPORTES_IDS, KPI_DASH_TRANSPORTES_IDS, ordenarPorClave,
  type BloqueDashTransportesId, type EstadoDashTransportesId, type KpiDashTransportesId,
} from "@/lib/transportes-dashboard-disposicion";

export const Route = createFileRoute("/_authenticated/transportes/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard de Transportes | ADECOMEX" },
      { name: "description", content: "Viajes, contenedores, estados, ingresos y margen de los transportes por semana, mes o año." },
      { property: "og:title", content: "Dashboard de Transportes | ADECOMEX" },
      { property: "og:description", content: "Viajes, contenedores, estados, ingresos y margen de los transportes por semana, mes o año." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransporteDashboard,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error)?.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">No disponible</div>,
});

type Periodo = "semanal" | "mensual" | "anual";

// ---------- date helpers ----------
function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d: Date) { return new Date(d.getFullYear(), 11, 31); }
function fmtDate(d: Date) { return d.toLocaleDateString("es-DO", { day: "2-digit", month: "short" }); }
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}
const mesLargo = (d: Date) => d.toLocaleDateString("es-DO", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
const semanaLabel = (s: Date) => { const e = addDays(s, 6); return `Sem ${isoWeek(s)} · ${fmtDate(s)} – ${fmtDate(e)}, ${s.getFullYear()}`; };

const fmtRD = (n: number) => `RD$ ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;

const COLOR_ESTADO: Record<EstadoDashboard, string> = {
  programado: "var(--estado-programado)",
  en_transito: "var(--estado-en-transito)",
  retrasado: "var(--estado-retrasado)",
  entregado: "var(--estado-entregado)",
  facturado: "var(--estado-facturado)",
};

const ETIQUETAS_KPI: Record<KpiDashTransportesId, string> = {
  viajes: "Viajes", contenedores: "Contenedores", ingreso: "Ingreso Total", margen: "Margen",
};
const ETIQUETAS_BLOQUES: Record<BloqueDashTransportesId, string> = {
  estados: "Estados", contenedores: "Contenedores", rentabilidad: "Rentabilidad",
};

/** Rango inclusivo en YYYY-MM-DD; se compara con la fecha del viaje (Salida o creación en hora de Santo Domingo). */
type Rango = { desde: string; hasta: string };

function TransporteDashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("semanal");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [clienteId, setClienteId] = useState<string>("all");
  const [transportista, setTransportista] = useState<string>("all");
  const ordenKpi = useOrdenPreferencia(CLAVE_KPI_DASH_TRANSPORTES, KPI_DASH_TRANSPORTES_IDS, "No se pudo guardar el orden de los recuadros");
  const ordenEstados = useOrdenPreferencia(CLAVE_ESTADOS_DASH_TRANSPORTES, ESTADOS_DASH_TRANSPORTES_IDS, "No se pudo guardar el orden de los estados");
  const ordenBloques = useOrdenPreferencia(CLAVE_BLOQUES_DASH_TRANSPORTES, BLOQUES_DASH_TRANSPORTES_IDS, "No se pudo guardar el orden de los bloques", BLOQUES_DASH_TRANSPORTES_AL_INICIO);
  const personalizado = ordenKpi.personalizado || ordenEstados.personalizado || ordenBloques.personalizado;
  const restablecerDisposicion = () => {
    if (ordenKpi.personalizado) ordenKpi.restablecer();
    if (ordenEstados.personalizado) ordenEstados.restablecer();
    if (ordenBloques.personalizado) ordenBloques.restablecer();
  };

  const range = useMemo(() => {
    if (periodo === "semanal") {
      const start = startOfWeek(anchor);
      const prevStart = addDays(start, -7);
      return {
        start,
        actual: { desde: isoLocal(start), hasta: isoLocal(addDays(start, 6)) } as Rango,
        previo: { desde: isoLocal(prevStart), hasta: isoLocal(addDays(prevStart, 6)) } as Rango,
        label: semanaLabel(start),
        labelPrevio: `semana anterior (${semanaLabel(prevStart)})`,
      };
    }
    if (periodo === "anual") {
      const start = startOfYear(anchor);
      const prevStart = new Date(start.getFullYear() - 1, 0, 1);
      return {
        start,
        actual: { desde: isoLocal(start), hasta: isoLocal(endOfYear(start)) } as Rango,
        previo: { desde: isoLocal(prevStart), hasta: isoLocal(endOfYear(prevStart)) } as Rango,
        label: `Año ${start.getFullYear()}`,
        labelPrevio: `año anterior (${prevStart.getFullYear()})`,
      };
    }
    const start = startOfMonth(anchor);
    const prevStart = addMonths(start, -1);
    return {
      start,
      actual: { desde: isoLocal(start), hasta: isoLocal(endOfMonth(start)) } as Rango,
      previo: { desde: isoLocal(prevStart), hasta: isoLocal(endOfMonth(prevStart)) } as Rango,
      label: mesLargo(start),
      labelPrevio: `mes anterior (${mesLargo(prevStart)})`,
    };
  }, [periodo, anchor]);

  const { data: clientes } = useQuery({
    queryKey: ["dash-tr-clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  // Todos los transportes vigentes: el reparto de solicitudes de pago entre viajes
  // debe ser idéntico al de la pantalla «Transportes» (no depende de los filtros).
  const { data: todos } = useQuery({
    queryKey: ["dash-tr-rows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transportes")
        .select("id,estado,tipo,cliente_id,transportista,contenedores_cantidad,contenedores_detalle,placa_contenedor,fecha_salida,eta,created_at,pago_estado,solicitud_pago_id,factura_ecf_id,factura_legado:facturas_ecf!transportes_factura_ecf_id_fkey(id,monto_total,estado,eliminado_en,vinculo_por_linea,facturas_ecf_lineas(transporte_id,valor,itbis),cxc_pagos(monto))")
        .is("eliminado_en", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Misma fuente que la pantalla «Transportes» (desglose del comprobante).
  const { data: solicitudes } = useQuery({
    queryKey: ["transportes-solicitudes-ganancia"],
    queryFn: async () => (await supabase
      .from("solicitudes_pago_transporte")
      .select("id, transporte_id, estado, moneda, cantidad_viajes, precio_viaje, porcentaje_margen, monto, descuento_cxc")).data ?? [],
  });

  // Facturas e-CF vinculadas a cada transporte, con sus cobros (mismo saldo que Cuentas por Cobrar).
  const { data: vinculos } = useQuery({
    queryKey: ["dash-tr-facturas-ecf-cobros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transporte_facturas_ecf")
        .select("transporte_id, factura:facturas_ecf!transporte_facturas_ecf_factura_ecf_id_fkey(id,monto_total,estado,eliminado_en,vinculo_por_linea,facturas_ecf_lineas(transporte_id,valor,itbis),cxc_pagos(monto))");
      if (error) throw error;
      return (data ?? []) as unknown as { transporte_id: string; factura: FacturaCobroTransporte | null }[];
    },
  });

  const ganancias = useMemo(
    () => gananciaPorTransporte((todos ?? []) as any[], (solicitudes ?? []) as any[]),
    [todos, solicitudes],
  );
  const conFactura = useMemo(() => new Set((vinculos ?? []).map((v) => v.transporte_id as string)), [vinculos]);
  // Fracción ya cobrada de cada viaje según el estado de pago de sus facturas e-CF.
  const cobros = useMemo(() => {
    const porTransporte = new Map<string, FacturaCobroTransporte[]>();
    for (const v of vinculos ?? []) if (v.factura) (porTransporte.get(v.transporte_id) ?? porTransporte.set(v.transporte_id, []).get(v.transporte_id)!).push(v.factura);
    return cobroPorTransporte((todos ?? []).map((t) => {
      const legado = (t as { factura_legado?: FacturaCobroTransporte | null }).factura_legado;
      return { ...t, facturas: [...(porTransporte.get(t.id) ?? []), ...(legado ? [legado] : [])] } as ViajeDashboard & { facturas: FacturaCobroTransporte[] };
    }));
  }, [todos, vinculos]);

  const rows = useMemo(() => (todos ?? []).filter((r) =>
    r.tipo === "terrestre"
    && (clienteId === "all" || r.cliente_id === clienteId)
    && (transportista === "all" || r.transportista === transportista)), [todos, clienteId, transportista]);

  const transportistasList = useMemo(() => {
    const s = new Set<string>();
    (todos ?? []).forEach((r) => r.tipo === "terrestre" && r.transportista && s.add(r.transportista));
    return [...s].sort();
  }, [todos]);

  const enRango = (r: any, rg: Rango) => { const f = fechaViajePeriodo(r); return !!f && f >= rg.desde && f <= rg.hasta; };

  const current = useMemo(() => rows.filter((r) => enRango(r, range.actual)), [rows, range]);
  const previous = useMemo(() => rows.filter((r) => enRango(r, range.previo)), [rows, range]);

  const res = useMemo(() => resumenTransportes(current as ViajeDashboard[], ganancias, cobros), [current, ganancias, cobros]);
  const prev = useMemo(() => resumenTransportes(previous as ViajeDashboard[], ganancias, cobros), [previous, ganancias, cobros]);
  const hayPrevio = prev.viajes > 0;
  const deltas = {
    viajes: variacionPct(res.viajes, prev.viajes),
    contenedores: variacionPct(res.contenedores, prev.contenedores),
    ingreso: variacionPct(res.ingreso, prev.ingreso),
    margenPP: hayPrevio && prev.ingreso > 0 ? res.margenPct - prev.margenPct : null,
  };

  const estadosData = useMemo(() => {
    const cuenta = new Map<EstadoDashboard, number>();
    for (const r of current) {
      const e = estadoDashboard(r as ViajeDashboard, conFactura);
      cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
    }
    return ordenarPorClave(ESTADOS_DASHBOARD, ordenEstados.orden)
      .map((e) => ({ ...e, count: cuenta.get(e.key) ?? 0, color: COLOR_ESTADO[e.key] }));
  }, [current, conFactura, ordenEstados.orden]);

  const atrasados = useMemo(() => {
    const hoy = isoLocal(new Date());
    return current.filter((r) => {
      const e = estadoDashboard(r as ViajeDashboard, conFactura);
      return r.eta && String(r.eta).slice(0, 10) < hoy && e !== "entregado" && e !== "facturado";
    }).length;
  }, [current, conFactura]);

  const promedioCont = res.viajes > 0 ? res.contenedores / res.viajes : 0;

  // Tendencia: contenedores y margen % por período
  const trend = useMemo(() => {
    const buckets: { label: string; rango: Rango }[] = [];
    if (periodo === "semanal") {
      for (let i = 7; i >= 0; i--) {
        const s = addDays(range.start, -7 * i);
        buckets.push({ label: `S${isoWeek(s)}`, rango: { desde: isoLocal(s), hasta: isoLocal(addDays(s, 6)) } });
      }
    } else if (periodo === "anual") {
      // Vista anual: los 12 meses del año elegido.
      for (let m = 0; m < 12; m++) {
        const s = new Date(range.start.getFullYear(), m, 1);
        buckets.push({ label: s.toLocaleDateString("es-DO", { month: "short" }), rango: { desde: isoLocal(s), hasta: isoLocal(endOfMonth(s)) } });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const s = addMonths(range.start, -i);
        buckets.push({ label: s.toLocaleDateString("es-DO", { month: "short" }), rango: { desde: isoLocal(s), hasta: isoLocal(endOfMonth(s)) } });
      }
    }
    return buckets.map((b) => {
      const r = resumenTransportes(rows.filter((x) => enRango(x, b.rango)) as ViajeDashboard[], ganancias);
      return { label: b.label, contenedores: r.contenedores, margen: +r.margenPct.toFixed(1) };
    });
  }, [rows, ganancias, periodo, range.start]);

  const mover = (dir: 1 | -1) => setAnchor((a) =>
    periodo === "semanal" ? addDays(a, 7 * dir)
      : periodo === "anual" ? new Date(a.getFullYear() + dir, a.getMonth(), 1)
        : addMonths(a, dir));
  const goPrev = () => mover(-1);
  const goNext = () => mover(1);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[220px] text-center">
            <div className="font-semibold">{range.label}</div>
            <div className="text-[11px] text-muted-foreground">Variaciones vs. {range.labelPrevio}</div>
          </div>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Período siguiente"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <TabsList>
              <TabsTrigger value="semanal">Semanal</TabsTrigger>
              <TabsTrigger value="mensual">Mensual</TabsTrigger>
              <TabsTrigger value="anual">Anual</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {(clientes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={transportista} onValueChange={setTransportista}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Transportista" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los transportistas</SelectItem>
              {transportistasList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen ejecutivo */}
      {personalizado && (
        <div className="-mb-2 flex justify-end">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={restablecerDisposicion}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restablecer orden
          </Button>
        </div>
      )}
      <FilaRecuadrosOrdenable
        ariaLabel="Resumen del período"
        className="grid gap-3 grid-cols-2 lg:grid-cols-4"
        orden={ordenKpi.orden}
        onMover={ordenKpi.mover}
        etiquetas={ETIQUETAS_KPI}
        recuadros={{
          viajes: <KpiCard icon={<Truck className="h-4 w-4" />} title="Viajes" value={res.viajes.toString()} delta={deltas.viajes} />,
          contenedores: <KpiCard icon={<Package className="h-4 w-4" />} title="Contenedores" value={res.contenedores.toString()} delta={deltas.contenedores} />,
          ingreso: <KpiCard icon={<DollarSign className="h-4 w-4" />} title="Ingreso Total" hint="Monto a Facturar al Cliente" value={fmtRD(res.ingreso)} delta={deltas.ingreso} />,
          margen: <KpiCard icon={<TrendingUp className="h-4 w-4" />} title="Margen" hint="Ganancia ÷ Ingreso" value={`${res.margenPct.toFixed(1)}%`} delta={deltas.margenPP} pp />,
        } satisfies Record<KpiDashTransportesId, React.ReactNode>}
      />

      <BloquesOrdenables
        ariaLabel="Bloques del dashboard"
        className="space-y-4"
        orden={ordenBloques.orden}
        onMover={ordenBloques.mover}
        etiquetas={ETIQUETAS_BLOQUES}
        bloques={{
          estados: (
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Estados</CardTitle>
              {atrasados > 0 && (
                <Badge variant="destructive" className="mr-6 gap-1">
                  <AlertTriangle className="h-3 w-3" /> {atrasados} atrasado{atrasados !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <FilaRecuadrosOrdenable
                ariaLabel="Viajes por estado"
                className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"
                orden={ordenEstados.orden}
                onMover={ordenEstados.mover}
                etiquetas={Object.fromEntries(ESTADOS_DASHBOARD.map((e) => [e.key, e.label])) as Record<EstadoDashTransportesId, string>}
                recuadros={Object.fromEntries(estadosData.map((e) => [e.key, (
                  <div className="h-full rounded-md border bg-card p-3" style={{ borderLeft: `4px solid ${e.color}` }}>
                    <div className="flex items-center gap-1.5 pr-5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />{e.label}
                    </div>
                    <div className="text-2xl font-semibold">{e.count}</div>
                  </div>
                )])) as Record<EstadoDashTransportesId, React.ReactNode>}
              />
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={estadosData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={12} allowDecimals={false} stroke="var(--muted-foreground)" />
                    <Tooltip cursor={{ fill: "var(--muted)" }} formatter={(v: number) => [v, "Viajes"]}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                    <Bar dataKey="count" name="Viajes" radius={[4, 4, 0, 0]}>
                      {estadosData.map((e) => <Cell key={e.key} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda de estados">
                {estadosData.map((e) => (
                  <span key={e.key} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />{e.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Facturado incluye los viajes con al menos una factura e-CF vinculada; cada viaje cuenta en un solo estado.
              </p>
            </CardContent>
          </Card>
          ),
          contenedores: (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Contenedores</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total movilizados</div>
                  <div className="text-2xl font-semibold">{res.contenedores}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Promedio por viaje</div>
                  <div className="text-2xl font-semibold">{promedioCont.toFixed(2)}</div>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={12} allowDecimals={false} stroke="var(--muted-foreground)" />
                    <Tooltip cursor={{ fill: "var(--muted)" }} formatter={(v: number) => [v, "Contenedores"]}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                    <Bar dataKey="contenedores" fill="var(--info)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          ),
          rentabilidad: (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Rentabilidad (Terrestre)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="Costo del viaje" value={fmtRD(res.costo)} />
                <MiniStat label="Ingresos (Monto a Facturar)" value={fmtRD(res.ingreso)} />
                <MiniStat label="Ganancia RD$" value={fmtRD(res.ganancia)} />
                <MiniStat label="Margen %" value={`${res.margenPct.toFixed(1)}%`}
                  trend={deltas.margenPP == null ? undefined : deltas.margenPP >= 0 ? "up" : "down"}
                  extra={deltas.margenPP == null ? "Sin período anterior" : `${deltas.margenPP >= 0 ? "↑" : "↓"} ${Math.abs(deltas.margenPP).toFixed(1)}pp`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniStat label="Pendiente de cobro (Clientes)" value={fmtRD(res.pendienteCobro)} tone="warning"
                    extra={`Ingreso ${fmtRD(res.ingreso)} − cobrado ${fmtRD(res.cobrado)} (según cobros de sus facturas e-CF)`} />
                <MiniStat label="Neto a pagar a Transportistas (Monto Neto a Pagar)" value={fmtRD(res.netoPagar)} tone="info" />
              </div>
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={12} unit="%" stroke="var(--muted-foreground)" />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Margen"]}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                    <Line type="monotone" dataKey="margen" stroke="var(--success)" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          ),
        } satisfies Record<BloqueDashTransportesId, React.ReactNode>}
      />
    </div>
  );
}

function KpiCard({ icon, title, hint, value, delta, pp }: { icon: React.ReactNode; title: string; hint?: string; value: string; delta: number | null; pp?: boolean }) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 pr-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title={hint}>{icon}<span>{title}</span></div>
          {delta == null ? (
            <span className="flex items-center gap-0.5" title="El período anterior no tiene datos para comparar">
              <Minus className="h-3 w-3" /> sin base
            </span>
          ) : (
            <span className={`flex items-center gap-0.5 ${up ? "text-[var(--success)]" : "text-destructive"}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {`${up ? "+" : "−"}${Math.abs(delta).toFixed(1)}${pp ? "pp" : "%"}`}
            </span>
          )}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, extra, trend, tone }: { label: string; value: string; extra?: string; trend?: "up" | "down"; tone?: "warning" | "info" }) {
  const toneCls = tone === "warning" ? "border-[var(--warning)]/50 bg-[var(--warning)]/10" : tone === "info" ? "border-[var(--info)]/50 bg-[var(--info)]/10" : "";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {extra && <div className={`text-xs mt-0.5 ${trend === "up" ? "text-[var(--success)]" : trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>{extra}</div>}
    </div>
  );
}
