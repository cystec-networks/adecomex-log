import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TruncatedCell } from "@/components/truncated-cell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, Truck, Pencil, ChevronLeft, ChevronRight, Wallet, TrendingUp, BadgeMinus, RotateCcw, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TRANSPORTE_ESTADOS, TRANSPORTE_TIPOS, estadoBadgeTransporte } from "@/components/transporte-form";
import { parseLocalDate, fmtLocalDate, fmtLocalDateShort } from "@/lib/dates";
import { useGruposColapsados, EstadoDivider } from "@/lib/grupos-colapsados";
import {
  fechaViajePeriodo, gananciaPorTransporte, isoLocal, moverPeriodo, rangoPeriodo,
  totalesPeriodoTransportes, type ModoPeriodo, type TotalesPeriodoTransportes,
} from "@/lib/transporte-ganancia";
import {
  CLAVE_COLUMNAS_TRANSPORTES, CLAVE_KPI_TRANSPORTES, COLUMNAS_TRANSPORTES_IDS, KPI_TRANSPORTES_IDS,
  celdasFilaTotales, type ColumnaTransportesId, type KpiTransportesId,
} from "@/lib/transportes-disposicion";
import { EncabezadosOrdenables, FilaRecuadrosOrdenable, ThOrdenable, useOrdenPreferencia } from "@/components/orden-arrastrable";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const simboloMoneda = (m: string) => (m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$");
const fmtImporte = (n: number, m: string) =>
  `${n < 0 ? "-" : ""}${simboloMoneda(m)}${Math.abs(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KPI_INFO: Record<KpiTransportesId, { label: string; icon: LucideIcon; tono: string; valor: (t: TotalesPeriodoTransportes) => number }> = {
  flete: { label: "Total Flete", icon: Truck, tono: "bg-[var(--info)]/10 text-[var(--info)]", valor: (t) => t.flete },
  pagado: { label: "Total Pagado", icon: Wallet, tono: "bg-primary/10 text-primary", valor: (t) => t.pagado },
  ganancia: { label: "Total Ganancia", icon: TrendingUp, tono: "bg-[var(--success)]/10 text-[var(--success)]", valor: (t) => t.ganancia },
  "descuento-cxc": { label: "Total Descuento CxC", icon: BadgeMinus, tono: "bg-destructive/10 text-destructive", valor: (t) => -t.descuentoCxc },
};
const ETIQUETAS_KPI = Object.fromEntries(KPI_TRANSPORTES_IDS.map((id) => [id, KPI_INFO[id].label])) as Record<KpiTransportesId, string>;

function RecuadroTotal({ id, totales, periodo }: { id: KpiTransportesId; totales: [string, TotalesPeriodoTransportes][]; periodo: string }) {
  const info = KPI_INFO[id];
  const Icon = info.icon;
  // Solo las monedas con importe; si ninguna tiene, la primera (0).
  const lineas = totales.filter(([, t]) => info.valor(t) !== 0);
  const mostrar = lineas.length ? lineas : totales.slice(0, 1);
  return (
    <Card className="h-full">
      <CardContent className="p-2.5">
        <div className="flex items-center gap-2 pr-5">
          <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${info.tono}`}><Icon className="h-3.5 w-3.5" /></div>
          <div className="min-w-0 text-xs leading-4 text-muted-foreground">{info.label}</div>
        </div>
        <div className="mt-1.5 min-w-0 space-y-0.5">
          {mostrar.map(([moneda, t]) => (
            <div key={moneda} title={fmtImporte(info.valor(t), moneda)} className={`truncate whitespace-nowrap font-display font-bold leading-tight tabular-nums ${mostrar.length > 1 ? "text-base" : "text-xl"} ${id === "descuento-cxc" && info.valor(t) !== 0 ? "text-destructive" : ""}`}>
              {fmtImporte(info.valor(t), moneda)}
            </div>
          ))}
        </div>
        <div className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground" title={periodo}>{periodo}</div>
      </CardContent>
    </Card>
  );
}


export const Route = createFileRoute("/_authenticated/transportes/")({
  head: () => ({
    meta: [
      { title: "Transportes | ADECOMEX" },
      { name: "description", content: "Viajes de transporte con ganancia, descuentos por CxC y totales por semana, mes o año." },
      { property: "og:title", content: "Transportes | ADECOMEX" },
      { property: "og:description", content: "Viajes de transporte con ganancia, descuentos por CxC y totales por semana, mes o año." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { estado?: string } => {
    const estadosValidos = new Set(TRANSPORTE_ESTADOS.map((item) => item.v));
    const estado = typeof s.estado === "string"
      ? s.estado.split(",").filter((value) => estadosValidos.has(value)).join(",") || undefined
      : undefined;
    return estado ? { estado } : {};
  },
  component: Transportes,
});

function Transportes() {
  const { estado: estadoParam } = Route.useSearch();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(estadoParam ?? "todos");
  const [cliente, setCliente] = useState("todos");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => setEstado(estadoParam ?? "todos"), [estadoParam]);

  const { data } = useQuery({
    queryKey: ["transportes"],
    queryFn: async () => (await supabase
      .from("transportes")
      .select("*, clientes(nombre), expedientes(numero)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  // Solicitudes de pago: fuente del desglose del comprobante (Ganancia y Descuento CxC).
  // Bajo RLS solo las ven admin/transporte; para el resto las columnas muestran «—».
  const { data: solicitudes } = useQuery({
    queryKey: ["transportes-solicitudes-ganancia"],
    queryFn: async () => (await supabase
      .from("solicitudes_pago_transporte")
      .select("id, transporte_id, estado, moneda, cantidad_viajes, precio_viaje, porcentaje_margen, monto, descuento_cxc")).data ?? [],
  });
  const ganancias = useMemo(
    () => gananciaPorTransporte((data ?? []) as any[], (solicitudes ?? []) as any[]),
    [data, solicitudes],
  );

  const [modo, setModo] = useState<ModoPeriodo>("todo");
  const [ancla, setAncla] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const rango = useMemo(() => rangoPeriodo(modo, ancla), [modo, ancla]);
  const etiquetaPeriodo = !rango ? "Todos los períodos"
    : modo === "semana" ? `Semana del ${fmtLocalDate(rango.desde)} al ${fmtLocalDate(rango.hasta)}`
    : modo === "mes" ? `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}` : `Año ${ancla.getFullYear()}`;

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("transportes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transporte movido a la papelera");
      qc.invalidateQueries({ queryKey: ["transportes"] });
      qc.invalidateQueries({ queryKey: ["papelera-transportes"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover"),
  });

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = (data ?? []).filter((t: any) => {
    const estados = estado === "todos" ? [] : estado.split(",");
    if (estados.length > 0 && !estados.includes(t.estado)) return false;
    if (cliente !== "todos" && t.cliente_id !== cliente) return false;
    if (rango) {
      const f = fechaViajePeriodo(t);
      if (!f || f < rango.desde || f > rango.hasta) return false;
    }
    if (q && !norm(JSON.stringify(t)).includes(norm(q))) return false;
    return true;
  });
  const totales = totalesPeriodoTransportes(filtered as any[], ganancias);
  const ordenKpi = useOrdenPreferencia(CLAVE_KPI_TRANSPORTES, KPI_TRANSPORTES_IDS, "No se pudo guardar el orden de los recuadros");
  const ordenColumnas = useOrdenPreferencia(CLAVE_COLUMNAS_TRANSPORTES, COLUMNAS_TRANSPORTES_IDS, "No se pudo guardar el orden de las columnas");

  type SortKey = "numero_viaje" | "cliente" | "expediente" | "tipo" | "transportista" | "origen" | "destino" | "fecha_salida" | "eta" | "estado";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => setSort((s) => (!s || s.key !== key) ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null);
  const activeSort = sort ?? { key: "eta" as SortKey, dir: "asc" as const };
  const getVal = (t: any, k: SortKey) =>
    k === "cliente" ? (t.clientes?.nombre ?? "") :
    k === "expediente" ? (t.expedientes?.numero ?? "") :
    (t[k] ?? "");
  const cmp = (a: any, b: any) => {
    const av = getVal(a, activeSort.key); const bv = getVal(b, activeSort.key);
    const aE = av === "" || av == null; const bE = bv === "" || bv == null;
    if (aE && bE) return 0; if (aE) return 1; if (bE) return -1;
    let r = 0;
    if (activeSort.key === "eta" || activeSort.key === "fecha_salida") r = parseLocalDate(av).getTime() - parseLocalDate(bv).getTime();
    else r = String(av).localeCompare(String(bv), "es", { numeric: true });
    return activeSort.dir === "asc" ? r : -r;
  };
  const rows = [...filtered].sort(cmp);

  const TRANSPORTES_CERRADOS = ["entregado", "facturado"];
  const { esColapsado, toggleGrupo } = useGruposColapsados("transportes-grupos-colapsados", TRANSPORTES_CERRADOS);
  const ordenGrupos = TRANSPORTE_ESTADOS.map((s) => s.v);
  const grupos: [string, any[]][] = (() => {
    const map = new Map<string, any[]>();
    for (const t of rows) {
      const k = t.estado ?? "sin_estado";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort(
      (a, b) => (ordenGrupos.indexOf(a[0]) + 1 || 999) - (ordenGrupos.indexOf(b[0]) + 1 || 999),
    );
  })();


  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "eta";
  const SortBtn = ({ k, children }: { k: SortKey; children: ReactNode }) => {
    const active = isActive(k); const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    return (
      <button type="button" onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition-colors ${active ? "text-primary" : def ? "text-foreground/80" : "text-muted-foreground hover:text-foreground"}`}>
        {children}
        <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-40"}`}>{icon}</span>
      </button>
    );
  };
  const Etiqueta = ({ children }: { children: ReactNode }) => (
    <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
  );

  const fmt = (d: string | null) => fmtLocalDateShort(d);

  type Columna = {
    etiqueta: string;
    align?: "left" | "right" | "center";
    sort?: SortKey;
    celda: (t: any) => ReactNode;
    total?: (tot: TotalesPeriodoTransportes, moneda: string) => ReactNode;
  };
  const td = "px-3 py-2 whitespace-nowrap";
  const COLUMNAS: Record<ColumnaTransportesId, Columna> = {
    numero_viaje: { etiqueta: "N° Viaje", sort: "numero_viaje", celda: (t) => <td className={td}><Link to="/transportes/$id" params={{ id: t.id }} className="font-semibold text-primary hover:underline">{t.numero_viaje}</Link></td> },
    expediente: { etiqueta: "Expediente", sort: "expediente", celda: (t) => <td className={td}>{t.expedientes?.numero ? <Link to="/expedientes/$id" params={{ id: t.expediente_id }} className="expediente-numero hover:underline">{t.expedientes.numero} ↗</Link> : "—"}</td> },
    cliente: { etiqueta: "Cliente", sort: "cliente", celda: (t) => <td className={`${td} max-w-[180px] truncate`} title={t.clientes?.nombre ?? undefined}>{t.clientes?.nombre ?? "—"}</td> },
    tipo: { etiqueta: "Tipo", sort: "tipo", celda: (t) => <td className={`${td} text-muted-foreground`}>{TRANSPORTE_TIPOS.find((x) => x.v === t.tipo)?.l ?? "—"}</td> },
    transportista: { etiqueta: "Transportista", sort: "transportista", celda: (t) => <td className={`${td} max-w-[150px] truncate`} title={t.transportista ?? undefined}>{t.transportista ?? "—"}</td> },
    placa: { etiqueta: "Placa / Ctn", celda: (t) => <td className={`${td} text-muted-foreground text-xs tabular-nums`}><TruncatedCell value={t.placa_contenedor} maxClass="max-w-[110px]" /></td> },
    origen: { etiqueta: "Origen", sort: "origen", celda: (t) => <td className={`${td} text-muted-foreground`}>{t.origen ?? "—"}</td> },
    destino: { etiqueta: "Destino", sort: "destino", celda: (t) => <td className={`${td} text-muted-foreground`}>{t.destino ?? "—"}</td> },
    fecha_salida: { etiqueta: "Salida", sort: "fecha_salida", align: "right", celda: (t) => <td className={`${td} text-right tabular-nums text-muted-foreground`}>{fmt(t.fecha_salida)}</td> },
    eta: { etiqueta: "ETA", sort: "eta", align: "right", celda: (t) => <td className={`${td} text-right tabular-nums`}>{fmt(t.eta)}</td> },
    flete: {
      etiqueta: "Flete", align: "right",
      // Monto a Facturar al Cliente del comprobante (bruto), no el flete_monto guardado.
      celda: (t) => { const g = ganancias.get(t.id); return <td className={`${td} text-right tabular-nums`}>{g?.montoFacturar != null ? fmtImporte(g.montoFacturar, g.moneda) : "—"}</td>; },
      total: (tot, m) => fmtImporte(tot.flete, m),
    },
    pagado: {
      etiqueta: "Total Pagado", align: "right",
      celda: (t) => { const g = ganancias.get(t.id); return <td className={`${td} text-right tabular-nums`}>{g ? fmtImporte(g.netoPagar, g.moneda) : "—"}</td>; },
      total: (tot, m) => fmtImporte(tot.pagado, m),
    },
    ganancia: {
      etiqueta: "Ganancia", align: "right",
      celda: (t) => { const g = ganancias.get(t.id); return <td className={`${td} text-right tabular-nums font-medium`}>{g?.ganancia != null ? fmtImporte(g.ganancia, g.moneda) : "—"}</td>; },
      total: (tot, m) => fmtImporte(tot.ganancia, m),
    },
    "descuento-cxc": {
      etiqueta: "Descuento CxC", align: "right",
      celda: (t) => { const g = ganancias.get(t.id); return <td className={`${td} text-right tabular-nums ${g && g.descuentoCxc > 0 ? "text-destructive" : "text-muted-foreground"}`}>{g && g.descuentoCxc > 0 ? fmtImporte(-g.descuentoCxc, g.moneda) : "—"}</td>; },
      total: (tot, m) => <span className="text-destructive">{fmtImporte(-tot.descuentoCxc, m)}</span>,
    },
    estado: { etiqueta: "Estado", sort: "estado", align: "center", celda: (t) => <td className={`${td} text-center`}>{estadoBadgeTransporte(t.estado)}</td> },
  };
  const columnas = ordenColumnas.orden;
  const celdasTotales = celdasFilaTotales(columnas);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Transportes</h1>
          <p className="text-sm text-muted-foreground">Viajes y logística vinculados a expedientes.</p>
        </div>
        <Button asChild><Link to="/transportes/nuevo"><Plus className="h-4 w-4 mr-1" /> Nuevo transporte</Link></Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center gap-3 flex-wrap border-b pb-3">
          <Tabs value={modo} onValueChange={(v) => setModo(v as ModoPeriodo)}>
            <TabsList>
              <TabsTrigger value="todo">Todo</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mes</TabsTrigger>
              <TabsTrigger value="anio">Año</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setAncla((a) => moverPeriodo(modo, a, -1))} disabled={modo === "todo"} title="Período anterior" aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="date" className="w-[160px]" value={isoLocal(ancla)} disabled={modo === "todo"} aria-label="Fecha del período"
              onChange={(e) => e.target.value && setAncla(parseLocalDate(e.target.value))} />
            <Button size="icon" variant="outline" onClick={() => setAncla((a) => moverPeriodo(modo, a, 1))} disabled={modo === "todo"} title="Período siguiente" aria-label="Período siguiente"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <span className="text-sm font-semibold">{etiquetaPeriodo}</span>
          {ordenKpi.personalizado && (
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={ordenKpi.restablecer}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restablecer recuadros
            </Button>
          )}
          <div className="@container basis-full">
            <FilaRecuadrosOrdenable
              ariaLabel="Totales del período"
              orden={ordenKpi.orden}
              etiquetas={ETIQUETAS_KPI}
              onMover={ordenKpi.mover}
              className="grid grid-cols-1 gap-2 @sm:grid-cols-2 @3xl:grid-cols-4"
              recuadros={{
                flete: <RecuadroTotal id="flete" totales={totales} periodo={etiquetaPeriodo} />,
                pagado: <RecuadroTotal id="pagado" totales={totales} periodo={etiquetaPeriodo} />,
                ganancia: <RecuadroTotal id="ganancia" totales={totales} periodo={etiquetaPeriodo} />,
                "descuento-cxc": <RecuadroTotal id="descuento-cxc" totales={totales} periodo={etiquetaPeriodo} />,
              }}
            />
          </div>
        </CardHeader>
        <CardHeader className="flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-base flex-1 min-w-[160px]">{rows.length} transportes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {estado.includes(",") && <SelectItem value={estado}>Estados del Dashboard</SelectItem>}
              {TRANSPORTE_ESTADOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes</SelectItem>
              {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          {ordenColumnas.personalizado && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={ordenColumnas.restablecer}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restablecer columnas
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">{rango ? "Sin transportes en este período." : "Sin transportes."}</div>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-[13px] border-collapse">
                <thead className="sticky-table-header bg-muted/30 border-b">
                  <EncabezadosOrdenables orden={columnas} onMover={ordenColumnas.mover}>
                    <tr>
                      {columnas.map((id) => {
                        const c = COLUMNAS[id];
                        return (
                          <ThOrdenable key={id} id={id} etiqueta={c.etiqueta} align={c.align} className="whitespace-nowrap">
                            {c.sort ? <SortBtn k={c.sort}>{c.etiqueta}</SortBtn> : <Etiqueta>{c.etiqueta}</Etiqueta>}
                          </ThOrdenable>
                        );
                      })}
                      <th className="px-2"></th>
                    </tr>
                  </EncabezadosOrdenables>
                </thead>
                <tbody className="divide-y">
                  {grupos.map(([est, gRows]) => (
                    <Fragment key={est}>
                      <EstadoDivider
                        colSpan={columnas.length + 1}
                        count={gRows.length}
                        colapsado={esColapsado(est)}
                        onToggle={() => toggleGrupo(est)}
                        label={estadoBadgeTransporte(est)}
                      />
                      {!esColapsado(est) && gRows.map((t: any) => (
                        <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                          {columnas.map((id) => <Fragment key={id}>{COLUMNAS[id].celda(t)}</Fragment>)}
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Editar">
                              <Link to="/transportes/$id" params={{ id: t.id }}><Pencil className="h-4 w-4" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setToTrash({ id: t.id, numero: t.numero_viaje })} title="Mover a papelera">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {totales.map(([moneda, tot], i) => (
                    <tr key={moneda} className={`bg-primary/10 font-bold ${i === 0 ? "border-t-2" : ""}`}>
                      {celdasTotales.map((c, j) => c.tipo === "total" ? (
                        <td key={j} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{COLUMNAS[c.id].total!(tot, moneda)}</td>
                      ) : c.tipo === "etiqueta" ? (
                        <td key={j} className="px-3 py-2 text-xs uppercase tracking-wide" colSpan={c.colSpan}>
                          Total del período{totales.length > 1 ? ` (${moneda})` : ""}
                        </td>
                      ) : <td key={j} colSpan={c.colSpan} />)}
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>El transporte <strong>{toTrash?.numero}</strong> se moverá a la papelera.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}>
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
