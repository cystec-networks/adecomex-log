import { createFileRoute, redirect, Link } from "@tanstack/react-router";
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
import { Copy, ExternalLink, Pencil, Printer, Trash2, Truck } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { SolicitudPagoPrintDialog } from "@/components/solicitud-pago-print";

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
  cantidad_viajes: number | null;
  moneda: string;
  referencia_viaje: string | null;
  placa_contenedor: string | null;
  descripcion: string | null;
  transporte_id: string | null;
  estado: string;
  created_at: string;
};


const fmtMoney = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SolicitudesPagoTransportePage() {
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

  const copiar = async (numero: string) => {
    try {
      await navigator.clipboard.writeText(numero);
      toast.success(`Número ${numero} copiado`);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({
    transportista_nombre: "", transportista_rnc: "", telefono: "",
    monto: "", moneda: "DOP", referencia_viaje: "", descripcion: "",
  });
  const setF = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [eliminando, setEliminando] = useState<Row | null>(null);

  const abrirEdicion = (r: Row) => {
    setEditing(r);
    setForm({
      transportista_nombre: r.transportista_nombre ?? "",
      transportista_rnc: r.transportista_rnc ?? "",
      telefono: r.telefono ?? "",
      monto: r.monto != null ? String(r.monto) : "",
      moneda: r.moneda ?? "DOP",
      referencia_viaje: r.referencia_viaje ?? "",
      descripcion: r.descripcion ?? "",
    });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const monto = Number(form.monto);
      if (!form.transportista_nombre.trim()) throw new Error("Indica el nombre del transportista");
      if (!Number.isFinite(monto) || monto <= 0) throw new Error("Indica un monto mayor a 0");
      const { error } = await supabase
        .from("solicitudes_pago_transporte")
        .update({
          transportista_nombre: form.transportista_nombre.trim(),
          transportista_rnc: form.transportista_rnc.trim() || null,
          telefono: form.telefono.trim() || null,
          monto,
          moneda: form.moneda,
          referencia_viaje: form.referencia_viaje.trim() || null,
          descripcion: form.descripcion.trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud actualizada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transporte"] });
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


  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Solicitudes de Pago de Transporte</h1>
        <p className="text-sm text-muted-foreground">
          Solicitudes generadas por transportistas desde la página pública.
        </p>
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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Número de control</th>
                <th className="py-2 pr-3">Transportista</th>
                <th className="py-2 pr-3">RNC</th>
                <th className="py-2 pr-3">Teléfono</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3">Moneda</th>

                <th className="py-2 pr-3">Referencia</th>
                <th className="py-2 pr-3">Creada</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Sin solicitudes</td></tr>
              ) : filtradas.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono">{r.numero_control}</td>
                  <td className="py-2 pr-3">{r.transportista_nombre}</td>
                  <td className="py-2 pr-3">{r.transportista_rnc || "—"}</td>
                  <td className="py-2 pr-3">{r.telefono || "—"}</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(Number(r.monto), r.moneda)}</td>
                  <td className="py-2 pr-3 text-right">{r.cantidad_viajes ?? 1}</td>
                  <td className="py-2 pr-3">{r.moneda}</td>
                  <td className="py-2 pr-3">{r.referencia_viaje || "—"}</td>
                  <td className="py-2 pr-3">{fmtLocalDate(r.created_at)}</td>
                  <td className="py-2 pr-3">
                    {r.estado === "vinculada" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Vinculada</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.estado === "vinculada" && r.transporte_id ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/transportes/$id" params={{ id: r.transporte_id }}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver transporte
                        </Link>
                      </Button>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" onClick={() => copiar(r.numero_control)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar número
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/transportes/nuevo" search={{ control: r.numero_control }}>
                            <Truck className="h-3.5 w-3.5 mr-1" /> Convertir en Transporte
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => abrirEdicion(r)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEliminando(r)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar solicitud {editing?.numero_control}</DialogTitle>
            <DialogDescription>Actualiza los datos enviados por el transportista.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Nombre del transportista *</Label>
              <Input value={form.transportista_nombre} maxLength={200} onChange={(e) => setF("transportista_nombre", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>RNC / Cédula</Label>
              <Input value={form.transportista_rnc} maxLength={30} onChange={(e) => setF("transportista_rnc", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Teléfono</Label>
              <Input value={form.telefono} maxLength={30} onChange={(e) => setF("telefono", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Monto *</Label>
              <Input
                inputMode="decimal"
                value={form.monto}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setF("monto", v);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Moneda</Label>
              <Select value={form.moneda} onValueChange={(v) => setF("moneda", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Referencia del viaje</Label>
              <Input value={form.referencia_viaje} maxLength={120} onChange={(e) => setF("referencia_viaje", e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Descripción</Label>
              <Textarea rows={3} maxLength={1000} value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar cambios"}
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
    </div>
  );
}
