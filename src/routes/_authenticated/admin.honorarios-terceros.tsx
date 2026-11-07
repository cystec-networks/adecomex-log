import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as XLSXNS from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Undo2 } from "lucide-react";
import { cambioPagoHonorario, honorariosParaCambio, type EstadoPagoHonorario } from "@/lib/honorarios-pago";
import { agruparHonorariosPendientes } from "@/lib/gastos-agrupados";
import { buildEstadoCuentaHonorariosPdf } from "@/lib/pdf-solicitud-reembolso";
import { fmtLocalDate, parseLocalDate } from "@/lib/dates";

const CONCEPTO_HONORARIOS = "Honorarios de terceros";

export const Route = createFileRoute("/_authenticated/admin/honorarios-terceros")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "finanzas", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: HonorariosPage,
  head: () => ({
    meta: [
      { title: "Honorarios de Terceros | ADECOMEX" },
      { name: "description", content: "Control del pago semanal de honorarios a gestores por los trámites realizados en los expedientes." },
      { property: "og:title", content: "Honorarios de Terceros | ADECOMEX" },
      { property: "og:description", content: "Control del pago semanal de honorarios a gestores por los trámites realizados en los expedientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Modo = "semana" | "mes" | "anio";
type Honorario = {
  id: string;
  expedienteId: string;
  expediente: string;
  cliente: string;
  declaracion: string;
  descripcion: string;
  mercanciaBl: string;
  proveedor: string;
  fecha: string;
  monto: number;
  estado: "pendiente" | "pagado";
  fechaPago: string | null;
};

const fmtMoney = (n: number) =>
  `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyPago = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function lunesDe(d: Date) {
  const x = new Date(d); const dia = x.getDay(); x.setHours(0, 0, 0, 0);
  return addDays(x, dia === 0 ? -6 : 1 - dia);
}
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const normProv = (p: string | null | undefined) => (p ?? "").trim().replace(/\s+/g, " ").toUpperCase() || "SIN PROVEEDOR";

/** Número DUA; al pasar el mouse muestra la Descripción del Expediente (ficha General). */
function CeldaDeclaracion({ h }: { h: Honorario }) {
  const descripcion = h.descripcion || "Sin descripción registrada";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Declaración ${h.declaracion || "sin número"}: ${descripcion}`} className="cursor-help underline decoration-dotted underline-offset-2">
          {h.declaracion || "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-sm whitespace-pre-wrap break-words text-xs">
        {descripcion}
      </TooltipContent>
    </Tooltip>
  );
}

function HonorariosPage() {
  const [modo, setModo] = useState<Modo>("semana");
  const [ancla, setAncla] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [proveedor, setProveedor] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "pendiente" | "pagado">("todos");

  const { desde, hasta } = useMemo(() => {
    if (modo === "semana") { const l = lunesDe(ancla); return { desde: l, hasta: addDays(l, 6) }; }
    if (modo === "mes") return { desde: new Date(ancla.getFullYear(), ancla.getMonth(), 1), hasta: new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0) };
    return { desde: new Date(ancla.getFullYear(), 0, 1), hasta: new Date(ancla.getFullYear(), 11, 31) };
  }, [modo, ancla]);

  const { data: honorarios = [], isLoading } = useQuery({
    queryKey: ["reporte-honorarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("id, monto, fecha, created_at, proveedor, pago_estado, fecha_pago, expediente_id, expedientes!inner(id, numero, numero_dua, bl_awb, descripcion_mercancia, clientes(nombre))")
        .ilike("concepto", CONCEPTO_HONORARIOS)
        .eq("es_reembolso", false)
        .is("deleted_at", null);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.expedientes)
        .map<Honorario>((r) => ({
          id: r.id,
          expedienteId: r.expedientes.id,
          expediente: r.expedientes.numero ?? "",
          cliente: r.expedientes.clientes?.nombre ?? "—",
          declaracion: String(r.expedientes.numero_dua ?? "").trim(),
          descripcion: String(r.expedientes.descripcion_mercancia ?? "").trim(),
          mercanciaBl: [r.expedientes.descripcion_mercancia, r.expedientes.bl_awb ? `BL: ${r.expedientes.bl_awb}` : ""].filter(Boolean).join("\n"),
          proveedor: normProv(r.proveedor),
          fecha: r.fecha ?? String(r.created_at ?? "").slice(0, 10),
          monto: Number(r.monto) || 0,
          estado: r.pago_estado === "pagado" ? "pagado" : "pendiente",
          fechaPago: r.fecha_pago ?? null,
        }))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    },
  });

  const proveedores = useMemo(() => [...new Set(honorarios.map((h) => h.proveedor))].sort(), [honorarios]);

  const visibles = useMemo(() => {
    const d = iso(desde), h = iso(hasta);
    const q = busqueda.trim().toLowerCase();
    return honorarios.filter((s) =>
      s.fecha >= d && s.fecha <= h &&
      (proveedor === "todos" || s.proveedor === proveedor) &&
      (estadoFiltro === "todos" || s.estado === estadoFiltro) &&
      (!q || s.cliente.toLowerCase().includes(q) || s.expediente.toLowerCase().includes(q) || s.declaracion.toLowerCase().includes(q)),
    );
  }, [honorarios, desde, hasta, proveedor, busqueda, estadoFiltro]);

  const totales = useMemo(() => {
    const pendiente = visibles.filter((s) => s.estado === "pendiente").reduce((a, s) => a + s.monto, 0);
    const pagado = visibles.filter((s) => s.estado === "pagado").reduce((a, s) => a + s.monto, 0);
    return { pendiente, pagado, general: pendiente + pagado };
  }, [visibles]);

  const porProveedor = useMemo(() => {
    const m = new Map<string, { pendiente: number; pagado: number; n: number }>();
    for (const s of visibles) {
      const t = m.get(s.proveedor) ?? { pendiente: 0, pagado: 0, n: 0 };
      t[s.estado] += s.monto; t.n += 1;
      m.set(s.proveedor, t);
    }
    return [...m.entries()].sort((a, b) => b[1].pendiente - a[1].pendiente);
  }, [visibles]);

  const qc = useQueryClient();
  const filas = useMemo(() => agruparHonorariosPendientes(visibles), [visibles]);
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [dlgPago, setDlgPago] = useState(false);
  const [destinoPago, setDestinoPago] = useState<EstadoPagoHonorario>("pagado");
  const [idsEdicionFila, setIdsEdicionFila] = useState<string[] | null>(null);
  const [fechaPago, setFechaPago] = useState(hoyPago);
  const [guardando, setGuardando] = useState(false);
  const seleccionVisible = visibles.filter((s) => seleccion.has(s.id));
  const seleccionPendientes = honorariosParaCambio(seleccionVisible, "pagado");
  const seleccionPagados = honorariosParaCambio(seleccionVisible, "pendiente");
  const seleccionCambio = honorariosParaCambio(idsEdicionFila ? honorarios.filter((s) => idsEdicionFila.includes(s.id)) : seleccionVisible, destinoPago);
  const todosMarcados = visibles.length > 0 && seleccionVisible.length === visibles.length;
  const toggle = (id: string, on: boolean) =>
    setSeleccion((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
  const toggleGrupo = (gastos: Honorario[], on: boolean) =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      gastos.forEach((g) => { if (on) n.add(g.id); else n.delete(g.id); });
      return n;
    });
  const toggleTodos = (on: boolean) => setSeleccion(on ? new Set(visibles.map((s) => s.id)) : new Set());

  const cambiarEstadoPago = async (destino = destinoPago, filasCambio = seleccionCambio, fecha = fechaPago) => {
    if ((destino === "pagado" && !fecha) || filasCambio.length === 0 || guardando) return;
    setGuardando(true);
    try {
      const ids = filasCambio.map((s) => s.id);
      const cambio = cambioPagoHonorario(destino, fecha);
      const { data, error } = await supabase
        .from("gastos")
        .update(cambio)
        .in("id", ids)
        .eq("pago_estado", destino === "pagado" ? "pendiente" : "pagado")
        .ilike("concepto", CONCEPTO_HONORARIOS)
        .eq("es_reembolso", false)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      const n = data?.length ?? 0;
      if (n < ids.length) toast.warning(`Se actualizaron ${n} de ${ids.length}; revise permisos o cambios recientes.`);
      else toast.success(`${n} honorario(s) marcados como ${destino === "pagado" ? "pagados" : "pendientes"}`);
      const actualizados = new Set((data ?? []).map((s) => s.id));
      qc.setQueryData<Honorario[]>(["reporte-honorarios"], (prev) => prev?.map((s) => actualizados.has(s.id) ? { ...s, estado: destino, fechaPago: cambio.fecha_pago } : s));
      setDlgPago(false);
      setIdsEdicionFila(null);
      setSeleccion(new Set());
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["reporte-honorarios"] }),
        ...Array.from(new Set(filasCambio.map((s) => s.expedienteId)), (id) => qc.invalidateQueries({ queryKey: ["gastos", id] })),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el estado de pago");
    } finally {
      setGuardando(false);
    }
  };

  const editarEstadoFila = (gastos: Honorario[], valor: string) => {
    if (valor !== "pendiente" && valor !== "pagado") return;
    const cambios = honorariosParaCambio(gastos, valor);
    if (!cambios.length) return;
    if (valor === "pendiente") {
      void cambiarEstadoPago(valor, cambios, "");
      return;
    }
    setIdsEdicionFila(cambios.map((s) => s.id));
    setDestinoPago(valor);
    setFechaPago(hoyPago());
    setDlgPago(true);
  };

  const selectorEstado = (gastos: Honorario[], estado: EstadoPagoHonorario, etiqueta: string) => (
    <Select value={estado} disabled={guardando} onValueChange={(valor) => editarEstadoFila(gastos, valor)}>
      <SelectTrigger aria-label={etiqueta} title={etiqueta} className={`h-7 w-[112px] text-[12px] ${estado === "pendiente" ? "text-destructive border-destructive/40" : "bg-muted text-foreground"}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pendiente">Pendiente</SelectItem>
        <SelectItem value="pagado">Pagado</SelectItem>
      </SelectContent>
    </Select>
  );

  const mover = (delta: number) => setAncla((prev) => {
    if (modo === "semana") return addDays(lunesDe(prev), delta * 7);
    if (modo === "mes") return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
    return new Date(prev.getFullYear() + delta, 0, 1);
  });

  const etiquetaPeriodo = modo === "semana"
    ? `Semana del ${fmtLocalDate(iso(desde))} al ${fmtLocalDate(iso(hasta))}`
    : modo === "mes" ? `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}` : `Año ${ancla.getFullYear()}`;

  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [vistaPreviaPdf, setVistaPreviaPdf] = useState<{ url: string; nombre: string } | null>(null);
  useEffect(() => {
    if (!vistaPreviaPdf) return;
    return () => URL.revokeObjectURL(vistaPreviaPdf.url);
  }, [vistaPreviaPdf]);
  const pendientesVisibles = visibles.filter((s) => s.estado === "pendiente");

  const exportEstadoCuenta = async () => {
    if (pendientesVisibles.length === 0) return;
    setGenerandoPdf(true);
    try {
      const grupos = new Map<string, Honorario[]>();
      for (const s of [...pendientesVisibles].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
        grupos.set(s.proveedor, [...(grupos.get(s.proveedor) ?? []), s]);
      }
      const gestores = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([prov, filas]) => ({
        proveedor: prov,
        filas: filas.map((f) => ({ fecha: fmtLocalDate(f.fecha), expediente: f.expediente, cliente: f.cliente, mercanciaBl: f.mercanciaBl, monto: f.monto })),
      }));
      const doc = await buildEstadoCuentaHonorariosPdf({
        fecha: new Date().toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" }),
        periodo: etiquetaPeriodo,
        gestores,
      });
      const nombre = gestores.length === 1 ? gestores[0].proveedor.replace(/[^\w]+/g, "_") : "Gestores";
      setVistaPreviaPdf({ url: URL.createObjectURL(doc.output("blob")), nombre: `Honorarios_${nombre}_${iso(new Date())}.pdf` });
      if (gestores.length > 1) toast.info(`El PDF incluye ${gestores.length} gestores, uno por página. Filtre por proveedor para un documento individual.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el estado de cuenta");
    } finally {
      setGenerandoPdf(false);
    }
  };

  const exportExcel = async () => {
    const XLSX: typeof XLSXNS = await import("xlsx");
    const aoa: any[][] = [
      ["Honorarios de Terceros"],
      [`Período: ${etiquetaPeriodo}`],
      [`Proveedor: ${proveedor === "todos" ? "Todos" : proveedor}`],
      [`Generado: ${new Date().toLocaleString("es-DO")}`],
      [],
      ["Proveedor", "Fecha del gasto", "Expediente", "Cliente", "Monto (RD$)", "Estado", "Fecha de pago"],
    ];
    visibles.forEach((s) => aoa.push([
      s.proveedor, fmtLocalDate(s.fecha, undefined, ""), s.expediente, s.cliente, s.monto,
      s.estado === "pagado" ? "Pagado" : "Pendiente", fmtLocalDate(s.fechaPago, undefined, ""),
    ]));
    aoa.push([]);
    porProveedor.forEach(([p, t]) => aoa.push([`${p} — pendiente`, "", "", "", t.pendiente], [`${p} — pagado`, "", "", "", t.pagado]));
    aoa.push([]);
    aoa.push(["TOTAL PENDIENTE", "", "", "", totales.pendiente]);
    aoa.push(["TOTAL PAGADO", "", "", "", totales.pagado]);
    aoa.push(["TOTAL GENERAL", "", "", "", totales.general]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Honorarios");
    XLSX.writeFile(wb, `Honorarios_${iso(desde)}_${iso(hasta)}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Honorarios de Terceros</h1>
          <p className="text-sm text-muted-foreground">Control del pago semanal a gestores por los trámites en los expedientes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border bg-muted/30 px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total pendiente</div>
            <div className="text-lg font-bold text-destructive">{fmtMoney(totales.pendiente)}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total pagado</div>
            <div className="text-lg font-bold">{fmtMoney(totales.pagado)}</div>
          </div>
        </div>
      </div>

      {porProveedor.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {porProveedor.map(([p, t]) => (
            <button
              key={p}
              type="button"
              onClick={() => setProveedor(proveedor === p ? "todos" : p)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${proveedor === p ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="truncate text-[13px] font-semibold" title={p}>{p}</div>
              <div className="text-[11px] text-muted-foreground">{t.n} trámite(s)</div>
              <div className="mt-1 flex justify-between text-[12px]">
                <span>Pendiente <b className="text-destructive">{fmtMoney(t.pendiente)}</b></span>
                <span>Pagado <b>{fmtMoney(t.pagado)}</b></span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <TabsList>
                <TabsTrigger value="semana">Semana</TabsTrigger>
                <TabsTrigger value="mes">Mes</TabsTrigger>
                <TabsTrigger value="anio">Año</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => mover(-1)} title="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
              <Input type="date" className="w-[160px]" value={iso(ancla)} onChange={(e) => e.target.value && setAncla(parseLocalDate(e.target.value))} />
              <Button size="icon" variant="outline" onClick={() => mover(1)} title="Siguiente"><ChevronRight className="h-4 w-4" /></Button>
              <Select value={proveedor} onValueChange={setProveedor}>
                <SelectTrigger className="w-[190px]" title={proveedor === "todos" ? "Todos los proveedores" : proveedor}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los proveedores</SelectItem>
                  {proveedores.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Cliente o expediente…" className="w-[180px]" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as any)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Solo pendientes</SelectItem>
                  <SelectItem value="pagado">Solo pagados</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportExcel} disabled={visibles.length === 0}><Download className="mr-1 h-4 w-4" /> Excel</Button>
              <Button variant="outline" onClick={exportEstadoCuenta} disabled={generandoPdf || pendientesVisibles.length === 0}
                title="Vista previa del estado de cuenta de honorarios pendientes por gestor">
                <FileText className="mr-1 h-4 w-4" /> {generandoPdf ? "Generando…" : "Estado de cuenta PDF"}
              </Button>
            </div>
          </div>
          <CardTitle className="pt-2 text-base">{etiquetaPeriodo}</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <CardDescription>{visibles.length} honorario(s)</CardDescription>
            {seleccionPendientes.length > 0 && (
              <Button size="sm" disabled={guardando} onClick={() => { setIdsEdicionFila(null); setDestinoPago("pagado"); setFechaPago(hoyPago()); setDlgPago(true); }}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Marcar como pagado ({seleccionPendientes.length})
              </Button>
            )}
            {seleccionPagados.length > 0 && (
              <Button size="sm" variant="outline" disabled={guardando} onClick={() => { setIdsEdicionFila(null); setDestinoPago("pendiente"); setDlgPago(true); }}>
                <Undo2 className="mr-1 h-4 w-4" /> Marcar como pendiente ({seleccionPagados.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando…</div>
          ) : visibles.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No hay honorarios de terceros en este período.</div>
          ) : (
            <TooltipProvider delayDuration={200}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 w-8"><Checkbox aria-label="Seleccionar todos" checked={todosMarcados} onCheckedChange={(v) => toggleTodos(v === true)} /></th>
                  <th className="py-2 pr-3">Fecha del gasto</th>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3">Expediente</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Declaración</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Fecha de pago</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const renderIndividual = (s: Honorario, detalle = false) => (
                  <tr key={s.id} className={`border-b last:border-0 whitespace-nowrap ${detalle ? "bg-muted/30" : ""}`}>
                    <td className="py-1.5 pr-3"><Checkbox aria-label={`Seleccionar gasto ${s.expediente} ${fmtLocalDate(s.fecha)} ${fmtMoney(s.monto)}`} checked={seleccion.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} /></td>
                    <td className="py-1.5 pr-3">{fmtLocalDate(s.fecha)}</td>
                    <td className="py-1.5 pr-3 max-w-[180px] truncate" title={s.proveedor}>{s.proveedor}</td>
                    <td className="py-1.5 pr-3">
                      <Link to="/expedientes/$id" params={{ id: s.expedienteId }} className="expediente-numero hover:underline">{s.expediente}</Link>
                    </td>
                    <td className="py-1.5 pr-3 max-w-[170px] truncate" title={s.cliente}>{s.cliente}</td>
                    <td className="py-1.5 pr-3"><CeldaDeclaracion h={s} /></td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{fmtMoney(s.monto)}</td>
                    <td className="py-1.5 pr-3">
                      {selectorEstado([s], s.estado, `Estado del gasto ${s.expediente} ${fmtLocalDate(s.fecha)} ${fmtMoney(s.monto)}`)}
                    </td>
                    <td className="py-1.5">{fmtLocalDate(s.fechaPago)}</td>
                  </tr>
                  );
                  if (fila.tipo === "simple") return renderIndividual(fila.gasto);
                  const primero = fila.gastos[0];
                  if (!primero) return null;
                  const abierto = Boolean(gruposAbiertos[fila.clave]);
                  const marcados = fila.gastos.filter((g) => seleccion.has(g.id)).length;
                  const fechas = fila.gastos.map((g) => g.fecha).sort();
                  const primeraFecha = fechas[0];
                  const ultimaFecha = fechas[fechas.length - 1];
                  return (
                    <Fragment key={fila.clave}>
                      <tr className="border-b whitespace-nowrap hover:bg-muted/30">
                        <td className="py-1.5 pr-3">
                          <Checkbox aria-label={`Seleccionar grupo ${primero.expediente} ${fila.proveedor}`} checked={marcados === fila.gastos.length ? true : marcados > 0 ? "indeterminate" : false} onCheckedChange={(v) => toggleGrupo(fila.gastos, v === true)} />
                        </td>
                        <td className="py-1.5 pr-3">{fmtLocalDate(primeraFecha)}{primeraFecha !== ultimaFecha && ` – ${fmtLocalDate(ultimaFecha)}`}</td>
                        <td className="py-1.5 pr-3 max-w-[180px] truncate" title={fila.proveedor}>{fila.proveedor}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`${abierto ? "Contraer" : "Expandir"} honorarios ${primero.expediente} ${fila.proveedor}`} title={abierto ? "Contraer detalle" : "Ver detalle de gastos"} aria-expanded={abierto} onClick={() => setGruposAbiertos((prev) => ({ ...prev, [fila.clave]: !prev[fila.clave] }))}>
                              {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <Link to="/expedientes/$id" params={{ id: primero.expedienteId }} className="expediente-numero hover:underline">{primero.expediente}</Link>
                            <Badge variant="outline" className="font-normal">{fila.gastos.length} gastos</Badge>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 max-w-[170px] truncate" title={primero.cliente}>{primero.cliente}</td>
                        <td className="py-1.5 pr-3"><CeldaDeclaracion h={primero} /></td>
                        <td className="py-1.5 pr-3 text-right font-semibold">{fmtMoney(fila.total)}</td>
                        <td className="py-1.5 pr-3">{selectorEstado(fila.gastos, "pendiente", `Estado del grupo ${primero.expediente} ${fila.proveedor}`)}</td>
                        <td className="py-1.5">—</td>
                      </tr>
                      {abierto && fila.gastos.map((g) => renderIndividual(g, true))}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={6}>Total pendiente</td>
                  <td className="py-2 pr-3 text-right text-destructive">{fmtMoney(totales.pendiente)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={6}>Total pagado</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(totales.pagado)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-t-2 bg-primary/10 font-bold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={6}>Total del período</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(totales.general)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Dialog open={vistaPreviaPdf !== null} onOpenChange={(open) => { if (!open) setVistaPreviaPdf(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
          <DialogHeader className="px-5 py-3 pr-10 border-b shrink-0">
            <DialogTitle className="text-base">Estado de Cuenta de Honorarios Pendientes</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30 overflow-hidden">
            {vistaPreviaPdf && <iframe src={vistaPreviaPdf.url} title="Vista previa del estado de cuenta de honorarios" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 shrink-0 sm:justify-between">
            {vistaPreviaPdf && (
              <Button variant="outline" size="sm" asChild>
                <a href={vistaPreviaPdf.url} download={vistaPreviaPdf.nombre}><Download className="mr-1 h-4 w-4" /> Descargar</a>
              </Button>
            )}
            <Button size="sm" onClick={() => setVistaPreviaPdf(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlgPago} onOpenChange={(open) => { if (!guardando) setDlgPago(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como {destinoPago}</DialogTitle>
            <DialogDescription>
              {seleccionCambio.length} honorario(s) por {fmtMoney(seleccionCambio.reduce((a, s) => a + s.monto, 0))}.
              {destinoPago === "pendiente" && " Se eliminará la fecha de pago y los importes volverán al total pendiente."}
            </DialogDescription>
          </DialogHeader>
          {destinoPago === "pagado" && <div className="grid gap-1.5">
            <label className="text-[13px] font-medium" htmlFor="fecha-pago-honorarios">Fecha de pago</label>
            <Input id="fecha-pago-honorarios" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgPago(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={() => void cambiarEstadoPago()} disabled={guardando || seleccionCambio.length === 0 || (destinoPago === "pagado" && !fechaPago)}>{guardando ? "Guardando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
