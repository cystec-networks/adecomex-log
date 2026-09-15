import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Plus, Printer, Trash2, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtLocalDate } from "@/lib/dates";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { cn } from "@/lib/utils";
import { SolicitudPagoPdfDialog } from "@/components/solicitud-pago-pdf-dialog";

export const Route = createFileRoute("/_authenticated/admin/solicitudes-pago-transporte")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "transporte"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: SolicitudesPagoTransportePage,
  head: () => ({
    meta: [
      { title: "Solicitudes de Pago de Transporte | ADECOMEX" },
      { name: "description", content: "Listado interno de solicitudes de pago enviadas por transportistas, con estado y vinculación a transportes." },
      { property: "og:title", content: "Solicitudes de Pago de Transporte | ADECOMEX" },
      { property: "og:description", content: "Listado interno de solicitudes de pago enviadas por transportistas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  id: string;
  numero_control: string;
  transportista_nombre: string;
  transportista_rnc: string | null;
  telefono: string | null;
  monto: number;
  descuento_cxc: number | null;
  factura_costo_numero: string | null;
  factura_costo_fecha: string | null;
  cantidad_viajes: number | null;
  precio_viaje: number | null;
  porcentaje_margen: number | null;
  moneda: string;
  referencia_viaje: string | null;
  origen: string | null;
  destino: string | null;
  placa_contenedor: string | null;
  descripcion: string | null;
  transporte_id: string | null;
  cliente_id: string | null;
  fecha_salida: string | null;
  eta: string | null;
  estado_transporte: string | null;
  estado: string;
  created_at: string;
};

const ESTADOS_TRANSPORTE = [
  { v: "programado", l: "Programado" },
  { v: "en_transito", l: "En Tránsito" },
  { v: "entregado", l: "Entregado" },
  { v: "retrasado", l: "Retrasado" },
];

const SIN_CLIENTE = "__none__";

const netoDeSolicitud = (r: Row) => {
  const cantidad = r.cantidad_viajes != null ? Number(r.cantidad_viajes) : null;
  const precio = r.precio_viaje != null ? Number(r.precio_viaje) : null;
  const margen = r.porcentaje_margen != null ? Number(r.porcentaje_margen) : null;
  const facturar = cantidad != null && precio != null ? cantidad * precio : null;
  const costoCalculado = facturar != null && margen != null ? facturar * (1 - margen / 100) : null;
  const costoFinal = costoCalculado ?? Number(r.monto || 0);
  return Number((costoFinal - Number(r.descuento_cxc || 0)).toFixed(2));
};


const fmtMoney = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SolicitudesPagoTransportePage() {
  const nav = useNavigate();
  const [estado, setEstado] = useState<"todas" | "pendiente" | "vinculada">("todas");
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["solicitudes-pago-transporte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitudes_pago_transporte")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const { data: vinculados = [] } = useQuery({
    queryKey: ["transportes-por-solicitud-pago", rows.map((r) => r.id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transportes")
        .select("id, numero_viaje, solicitud_pago_id")
        .in("solicitud_pago_id", rows.map((r) => r.id));
      if (error) throw error;
      return (data ?? []) as { id: string; numero_viaje: string; solicitud_pago_id: string | null }[];
    },
  });

  const transportesPorSolicitud = useMemo(() => {
    const map: Record<string, { id: string; numero_viaje: string }[]> = {};
    for (const t of vinculados) {
      if (!t.solicitud_pago_id) continue;
      (map[t.solicitud_pago_id] ??= []).push({ id: t.id, numero_viaje: t.numero_viaje });
    }
    return map;
  }, [vinculados]);


  const filtradas = useMemo(() => {
    const term = sanitizeSearchTerm(q).toLowerCase();
    return rows.filter((r) => {
      if (estado !== "todas" && r.estado !== estado) return false;
      if (!term) return true;
      return [r.numero_control, r.transportista_nombre, r.referencia_viaje ?? ""]
        .some((v) => (v ?? "").toLowerCase().includes(term));
    });
  }, [rows, estado, q]);

  const resumen = useMemo(() => {
    const pendientes = rows.filter((r) => r.estado === "pendiente");
    const vinculadas = rows.filter((r) => r.estado === "vinculada");
    const porMoneda: Record<string, number> = {};
    for (const r of pendientes) {
      porMoneda[r.moneda] = (porMoneda[r.moneda] ?? 0) + Number(r.monto || 0);
    }
    return { pendientes: pendientes.length, vinculadas: vinculadas.length, porMoneda };
  }, [rows]);


  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState({
    transportista_nombre: "", transportista_rnc: "", telefono: "",
    monto: "", descuento_cxc: "", factura_costo_numero: "", factura_costo_fecha: "",
    cantidad_viajes: "", precio_viaje: "", porcentaje_margen: "",
    moneda: "DOP", descripcion: "",
    cliente_id: "", fecha_salida: "", eta: "", estado_transporte: "programado",
  });
  const setF = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [soloFinanzas, setSoloFinanzas] = useState(false);
  const [eliminando, setEliminando] = useState<Row | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [consultando, setConsultando] = useState<Row | null>(null);

  const abrirNueva = () => {
    setForm({
      transportista_nombre: "", transportista_rnc: "", telefono: "",
      monto: "", descuento_cxc: "", factura_costo_numero: "", factura_costo_fecha: "",
      cantidad_viajes: "1", precio_viaje: "", porcentaje_margen: "",
      moneda: "DOP", descripcion: "",
      cliente_id: "", fecha_salida: "", eta: "", estado_transporte: "programado",
    });
    setSoloFinanzas(false);
    setEditing("new");
  };

  const abrirEdicion = (r: Row, reducida = false) => {
    setSoloFinanzas(reducida);
    setEditing(r);
    setForm({
      transportista_nombre: r.transportista_nombre ?? "",
      transportista_rnc: r.transportista_rnc ?? "",
      telefono: r.telefono ?? "",
      monto: r.monto != null ? String(r.monto) : "",
      descuento_cxc: r.descuento_cxc != null ? String(r.descuento_cxc) : "",
      factura_costo_numero: r.factura_costo_numero ?? "",
      factura_costo_fecha: r.factura_costo_fecha ?? "",
      cantidad_viajes: r.cantidad_viajes != null ? String(r.cantidad_viajes) : "",
      precio_viaje: r.precio_viaje != null ? String(r.precio_viaje) : "",
      porcentaje_margen: r.porcentaje_margen != null ? String(r.porcentaje_margen) : "",
      moneda: r.moneda || "DOP",
      descripcion: r.descripcion ?? "",
      cliente_id: r.cliente_id ?? "",
      fecha_salida: r.fecha_salida ?? "",
      eta: r.eta ?? "",
      estado_transporte: r.estado_transporte ?? "programado",
    });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const monto = Number(form.monto);
      const descuento_cxc = form.descuento_cxc === "" ? 0 : Number(form.descuento_cxc);
      if (!form.transportista_nombre.trim()) throw new Error("Indica el nombre del transportista");
      if (!Number.isFinite(monto) || monto <= 0) throw new Error("Indica un monto mayor a 0");
      if (!Number.isFinite(descuento_cxc) || descuento_cxc < 0) throw new Error("El descuento por CxC no puede ser negativo");
      const numOrNull = (v: string) => (v === "" ? null : Number(v));
      const cantidad_viajes = numOrNull(form.cantidad_viajes);
      const precio_viaje = numOrNull(form.precio_viaje);
      const porcentaje_margen = numOrNull(form.porcentaje_margen);
      if (cantidad_viajes != null && (!Number.isFinite(cantidad_viajes) || cantidad_viajes <= 0)) throw new Error("La cantidad de viajes debe ser mayor a 0");
      if (precio_viaje != null && (!Number.isFinite(precio_viaje) || precio_viaje < 0)) throw new Error("El precio por viaje no puede ser negativo");
      if (porcentaje_margen != null && (!Number.isFinite(porcentaje_margen) || porcentaje_margen < 0 || porcentaje_margen > 100)) throw new Error("El % de margen debe estar entre 0 y 100");
      const trio = [cantidad_viajes, precio_viaje, porcentaje_margen];
      const llenos = trio.filter((v) => v != null).length;
      if (llenos > 0 && llenos < 3) {
        throw new Error("Si vas a calcular por margen, completa Cantidad de Viajes, Precio por Viaje y % Margen juntos — o déjalos los 3 vacíos y usa el Costo del Viaje directo.");
      }
      const financiero = {
        monto,
        descuento_cxc,
        factura_costo_numero: form.factura_costo_numero.trim() || null,
        factura_costo_fecha: form.factura_costo_fecha || null,
        cantidad_viajes: cantidad_viajes ?? 1,
        precio_viaje,
        porcentaje_margen,
      };
      const completo = {
        ...financiero,
        transportista_nombre: form.transportista_nombre.trim(),
        transportista_rnc: form.transportista_rnc.trim() || null,
        telefono: form.telefono.trim() || null,
        moneda: form.moneda || "DOP",
        descripcion: form.descripcion.trim() || null,
        cliente_id: form.cliente_id || null,
        fecha_salida: form.fecha_salida || null,
        eta: form.eta || null,
        estado_transporte: form.estado_transporte || "programado",
      };
      const payload = soloFinanzas && editing !== "new" ? financiero : completo;
      const { error } = editing === "new"
        ? await supabase.from("solicitudes_pago_transporte").insert(completo)
        : await supabase.from("solicitudes_pago_transporte").update(payload).eq("id", editing.id);
      if (error) throw error;

      // Sincronizar el transporte vinculado con el nuevo neto
      if (editing !== "new") {
        const actualizada = { ...editing, ...payload } as Row;
        const neto = netoDeSolicitud(actualizada);
        const { error: errT } = await supabase
          .from("transportes")
          .update({ flete_monto: neto })
          .eq("numero_control_pago", editing.numero_control);
        if (errT) throw errT;
      }
    },
    onSuccess: () => {
      toast.success(editing === "new" ? "Solicitud creada" : "Solicitud actualizada");
      setEditing(null);
      setSoloFinanzas(false);
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transporte"] });
      qc.invalidateQueries({ queryKey: ["transportes"] });
      qc.invalidateQueries({ queryKey: ["registro-diario"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const eliminar = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("solicitudes_pago_transporte").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud eliminada");
      setEliminando(null);
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transporte"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  const convertir = useMutation({
    mutationFn: async (r: Row) => {
      if (r.estado === "vinculada" || (transportesPorSolicitud[r.id]?.length ?? 0) > 0) {
        throw new Error("Esta solicitud ya tiene un transporte vinculado — no se puede convertir de nuevo.");
      }
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        cliente_id: r.cliente_id ?? null,
        tipo: "terrestre",
        transportista: r.transportista_nombre,
        fecha_salida: r.fecha_salida ?? null,
        eta: r.eta ?? null,
        estado: r.estado_transporte ?? "programado",
        origen: r.origen ?? null,
        destino: r.destino ?? null,
        flete_monto: netoDeSolicitud(r),
        flete_moneda: "DOP",
        numero_control_pago: r.numero_control,
        solicitud_pago_id: r.id,
        observaciones: r.descripcion ?? null,
        created_by: u.user?.id ?? null,
      };
      const { data, error } = await supabase.from("transportes").insert(payload).select("id, numero_viaje").single();
      if (error) throw error;
      if (r.estado === "pendiente") {
        await supabase
          .from("solicitudes_pago_transporte")
          .update({ transporte_id: data.id, estado: "vinculada" })
          .eq("id", r.id);
      }
      return data;
    },
    onSuccess: (t: any) => {
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transporte"] });
      qc.invalidateQueries({ queryKey: ["transportes"] });
      toast.success(`Transporte ${t.numero_viaje} creado — completa la facturación al cliente`);
      nav({ to: "/transportes/$id", params: { id: t.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo convertir"),
  });


  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Solicitudes de Pago de Transporte</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes generadas por transportistas desde la página pública.
          </p>
        </div>
        <Button onClick={abrirNueva}><Plus className="h-4 w-4" /> Nueva solicitud</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{resumen.pendientes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vinculadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{resumen.vinculadas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monto pendiente</CardTitle>
            <CardDescription>Por moneda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.keys(resumen.porMoneda).length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              Object.entries(resumen.porMoneda).map(([m, total]) => (
                <div key={m} className="text-lg font-semibold">{fmtMoney(total, m)}</div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="vinculada">Vinculadas</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, transportista o referencia"
              className="sm:w-[340px]"
            />
          </div>
          <div className="text-sm text-muted-foreground">{filtradas.length} solicitud(es)</div>
        </CardHeader>
        <CardContent className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header">
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                 <th className="py-1.5 pr-3">Creada</th>
                 <th className="py-1.5 pr-3">Número de control</th>
                <th className="py-1.5 pr-3">Transportista</th>
                <th className="py-1.5 pr-3">Ruta</th>
                <th className="py-1.5 pr-3 text-right">Cantidad</th>
                 <th className="py-1.5 pr-3 text-right">Monto</th>
                 <th className="py-1.5 pr-3">Acciones</th>
                <th className="py-1.5 pr-3">Estado</th>
                <th className="py-1.5 pr-3">Transportes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Sin solicitudes</td></tr>
              ) : filtradas.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtLocalDate(r.created_at)}</td>
<td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2 hover:text-primary"
                      title="Ver solicitud (consulta)"
                      onClick={() => setConsultando(r)}
                    >
                      {r.numero_control}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3"><span className="block max-w-[180px] truncate" title={r.transportista_nombre}>{r.transportista_nombre}</span></td>
                  <td className="py-1.5 pr-3">
                    <span className="block max-w-[200px] truncate whitespace-nowrap" title={r.origen || r.destino ? `${r.origen ?? "—"} → ${r.destino ?? "—"}` : (r.referencia_viaje || "")}>
                      {r.origen || r.destino
                        ? `${r.origen ?? "—"} → ${r.destino ?? "—"}`
                        : (r.referencia_viaje || "—")}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{r.cantidad_viajes ?? 1}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtMoney(Number(r.monto), r.moneda)}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-nowrap items-center gap-1">
                      {(transportesPorSolicitud[r.id]?.length ?? 0) === 0 && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => abrirEdicion(r)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPdfId(r.id)} title="Ver comprobante PDF">
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      {(transportesPorSolicitud[r.id]?.length ?? 0) === 0 && (
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setEliminando(r)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {r.estado !== "vinculada" && (transportesPorSolicitud[r.id]?.length ?? 0) === 0 && (
                        <Button size="sm" disabled={convertir.isPending} onClick={() => convertir.mutate(r)}>
                          <Truck className="h-3.5 w-3.5 mr-1" /> Convertir
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.estado === "vinculada" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Vinculada</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {(transportesPorSolicitud[r.id]?.length ?? 0) === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (transportesPorSolicitud[r.id]?.length ?? 0) === 1 ? (
                      <Link
                        to="/transportes/$id"
                        params={{ id: transportesPorSolicitud[r.id][0].id }}
                        className="inline-flex whitespace-nowrap rounded-md border bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        {transportesPorSolicitud[r.id][0].numero_viaje}
                      </Link>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 min-w-[118px] justify-between gap-2 font-mono text-xs">
                            <span>{[...(transportesPorSolicitud[r.id] ?? [])].sort((a, b) => a.numero_viaje.localeCompare(b.numero_viaje))[0].numero_viaje}</span>
                            <Badge variant="secondary" className="h-5 min-w-5 px-1">+{(transportesPorSolicitud[r.id]?.length ?? 1) - 1}</Badge>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          {[...(transportesPorSolicitud[r.id] ?? [])].sort((a, b) => a.numero_viaje.localeCompare(b.numero_viaje)).map((t) => (
                            <DropdownMenuItem key={t.id} asChild>
                              <Link to="/transportes/$id" params={{ id: t.id }} className="font-mono">{t.numero_viaje}</Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva solicitud de pago" : `Editar solicitud ${editing?.numero_control}`}</DialogTitle>
            <DialogDescription>{editing === "new" ? "Registra manualmente una solicitud de pago de transporte." : "Actualiza los datos enviados por el transportista."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-12">
            <div className="grid gap-1.5 md:col-span-5">
              <Label>Nombre del transportista *</Label>
              <Input value={form.transportista_nombre} maxLength={200} onChange={(e) => setF("transportista_nombre", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-3">
              <Label>RNC / Cédula</Label>
              <Input value={form.transportista_rnc} maxLength={30} onChange={(e) => setF("transportista_rnc", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Teléfono</Label>
              <Input value={form.telefono} maxLength={30} onChange={(e) => setF("telefono", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Moneda</Label>
              <Select value={form.moneda || "DOP"} onValueChange={(v) => setF("moneda", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-4">
              <Label>Cliente Final</Label>
              <Select value={form.cliente_id || SIN_CLIENTE} onValueChange={(v) => setF("cliente_id", v === SIN_CLIENTE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— Sin cliente —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CLIENTE}>— Sin cliente —</SelectItem>
                  {(clientes ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Fecha de Salida</Label>
              <Input type="date" value={form.fecha_salida} onChange={(e) => setF("fecha_salida", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Fecha de Entrega (ETA)</Label>
              <Input type="date" value={form.eta} onChange={(e) => setF("eta", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Estado</Label>
              <Select value={form.estado_transporte} onValueChange={(v) => setF("estado_transporte", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_TRANSPORTE.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Cantidad de Viajes</Label>
              <Input
                inputMode="decimal"
                value={form.cantidad_viajes}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setF("cantidad_viajes", v);
                }}
              />
            </div>
            <div className="grid gap-1.5 md:col-span-3">
              <Label>Precio por Viaje</Label>
              <Input
                inputMode="decimal"
                value={form.precio_viaje}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setF("precio_viaje", v);
                }}
              />
            </div>
            <div className="grid gap-1.5 md:col-span-3">
              <Label>% Margen de Ganancia</Label>
              <Input
                inputMode="decimal"
                value={form.porcentaje_margen}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setF("porcentaje_margen", v);
                }}
              />
            </div>
            {(() => {
              const cantidad = form.cantidad_viajes === "" ? null : Number(form.cantidad_viajes);
              const precio = form.precio_viaje === "" ? null : Number(form.precio_viaje);
              const margen = form.porcentaje_margen === "" ? null : Number(form.porcentaje_margen);
              const montoFacturarCliente = cantidad != null && precio != null ? cantidad * precio : null;
              const costoViajeCalculado = montoFacturarCliente != null && margen != null
                ? montoFacturarCliente * (1 - margen / 100)
                : null;
              const costoViajeFinal = costoViajeCalculado ?? (Number(form.monto) || 0);
              const descuento = form.descuento_cxc === "" ? 0 : Number(form.descuento_cxc);
              const montoNeto = costoViajeFinal - descuento;
              return (
                <>
                  {montoFacturarCliente != null && (
                    <div className="grid gap-1.5 md:col-span-3">
                      <Label>Monto a Facturar al Cliente</Label>
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold">
                        {fmtMoney(montoFacturarCliente, form.moneda)}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-1.5 md:col-span-3">
                      <Label>Costo del Viaje *</Label>
                      <Input
                        inputMode="decimal"
                        value={form.monto}
                        onChange={(e) => {
                          const v = e.target.value.replace(",", ".");
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setF("monto", v);
                        }}
                      />
                  </div>
                  <div className="grid gap-1.5 md:col-span-3">
                      <Label>Descuento por CxC</Label>
                      <Input
                        inputMode="decimal"
                        value={form.descuento_cxc}
                        onChange={(e) => {
                          const v = e.target.value.replace(",", ".");
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setF("descuento_cxc", v);
                        }}
                      />
                  </div>
                  <div className="grid gap-1.5 md:col-span-3">
                    <Label>{costoViajeCalculado != null ? "Costo del Viaje (calculado)" : "Costo del Viaje (solicitado)"}</Label>
                    <div className="rounded-md border px-3 py-2 text-sm font-medium">
                      {fmtMoney(costoViajeFinal, form.moneda)}
                    </div>
                  </div>
                  <div className="grid gap-1.5 md:col-span-4">
                    <Label>Monto Neto a Pagar</Label>
                    <div className={cn(
                      "rounded-md border px-3 py-2 text-sm font-semibold",
                      montoNeto >= 0
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    )}>
                      {fmtMoney(montoNeto, form.moneda)}
                    </div>
                    {descuento > costoViajeFinal && (
                      <p className="text-xs text-destructive">El descuento supera el costo del viaje. Revisa antes de aprobar.</p>
                    )}
                  </div>
                  <div className="grid gap-1.5 md:col-span-4">
                      <Label>N° de Factura de Costo</Label>
                      <Input value={form.factura_costo_numero} maxLength={50} onChange={(e) => setF("factura_costo_numero", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5 md:col-span-4">
                      <Label>Fecha de Factura de Costo</Label>
                      <Input type="date" value={form.factura_costo_fecha} onChange={(e) => setF("factura_costo_fecha", e.target.value)} />
                  </div>
                </>
              );
            })()}
            <div className="grid gap-1.5 md:col-span-12">
              <Label>Descripción</Label>
              <Textarea rows={3} maxLength={1000} value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : editing === "new" ? "Crear solicitud" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!eliminando} onOpenChange={(o) => !o && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar solicitud</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar la solicitud {eliminando?.numero_control}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (eliminando) eliminar.mutate(eliminando); }}
              disabled={eliminar.isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!consultando} onOpenChange={(o) => !o && setConsultando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Solicitud {consultando?.numero_control}</DialogTitle>
            <DialogDescription>
              Vista de consulta (solo lectura){consultando?.estado === "vinculada" ? " — solicitud ya vinculada a transporte" : ""}.
            </DialogDescription>
          </DialogHeader>
          {consultando && (() => {
            const r = consultando;
            const cantidad = r.cantidad_viajes != null ? Number(r.cantidad_viajes) : null;
            const precio = r.precio_viaje != null ? Number(r.precio_viaje) : null;
            const margen = r.porcentaje_margen != null ? Number(r.porcentaje_margen) : null;
            const facturar = cantidad != null && precio != null ? cantidad * precio : null;
            const cliente = (clientes as any[]).find((c) => c.id === r.cliente_id);
            const transportes = transportesPorSolicitud[r.id] ?? [];
            const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-sm font-medium">{children}</div>
              </div>
            );
            return (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Item label="Fecha creada">{fmtLocalDate(r.created_at)}</Item>
                  <Item label="Estado">{r.estado === "vinculada" ? "Vinculada" : r.estado === "anulada" ? "Anulada" : "Pendiente"}</Item>
                  <Item label="Cliente">{cliente?.nombre ?? "—"}</Item>
                  <Item label="Moneda">{r.moneda}</Item>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Item label="Transportista">{r.transportista_nombre}</Item>
                  <Item label="RNC / Cédula">{r.transportista_rnc ?? "—"}</Item>
                  <Item label="Teléfono">{r.telefono ?? "—"}</Item>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Item label="Ruta">{r.origen || r.destino ? `${r.origen ?? "—"} → ${r.destino ?? "—"}` : (r.referencia_viaje ?? "—")}</Item>
                  <Item label="Contenedor(es)">{r.placa_contenedor ?? "—"}</Item>
                </div>
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Item label="Cantidad de viajes">{cantidad ?? 1}</Item>
                    <Item label="Precio por viaje">{precio != null ? fmtMoney(precio, r.moneda) : "—"}</Item>
                    <Item label="% Margen">{margen != null ? `${margen}%` : "—"}</Item>
                    <Item label="Monto a facturar">{facturar != null ? fmtMoney(facturar, r.moneda) : "—"}</Item>
                    <Item label="Costo del viaje">{fmtMoney(Number(r.monto), r.moneda)}</Item>
                    <Item label="Descuento CxC">{fmtMoney(Number(r.descuento_cxc ?? 0), r.moneda)}</Item>
                    <Item label="Neto a pagar"><span className="font-bold">{fmtMoney(netoDeSolicitud(r), r.moneda)}</span></Item>
                    <Item label="Factura de costo">
                      {r.factura_costo_numero ? `${r.factura_costo_numero}${r.factura_costo_fecha ? ` — ${fmtLocalDate(r.factura_costo_fecha)}` : ""}` : "—"}
                    </Item>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Item label="Fecha de salida">{r.fecha_salida ? fmtLocalDate(r.fecha_salida) : "—"}</Item>
                  <Item label="Fecha de entrega (ETA)">{r.eta ? fmtLocalDate(r.eta) : "—"}</Item>
                  <Item label="Estado del transporte">{ESTADOS_TRANSPORTE.find((e) => e.v === r.estado_transporte)?.l ?? "—"}</Item>
                </div>
                {transportes.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground">Transporte(s) vinculado(s)</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {transportes.map((t: any) => (
                        <Link
                          key={t.id}
                          to="/transportes/$id"
                          params={{ id: t.id }}
                          className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent"
                        >
                          {t.numero_viaje}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {r.descripcion && (
                  <div>
                    <div className="text-xs text-muted-foreground">Descripción</div>
                    <div className="whitespace-pre-wrap text-sm">{r.descripcion}</div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (consultando) setPdfId(consultando.id);
              }}
            >
              <Printer className="mr-1 h-4 w-4" /> Ver comprobante
            </Button>
            <Button variant="outline" onClick={() => setConsultando(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SolicitudPagoPdfDialog id={pdfId} open={!!pdfId} onOpenChange={(o) => !o && setPdfId(null)} />

    </div>

  );
}
