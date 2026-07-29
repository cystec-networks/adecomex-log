import { createFileRoute, redirect } from "@tanstack/react-router";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, CreditCard, Trash2, Pencil } from "lucide-react";
import { fmtLocalDate, daysFromToday } from "@/lib/dates";
import { EscanearFacturaCxpButton } from "@/components/escanear-factura-cxp-button";


export const Route = createFileRoute("/_authenticated/admin/cuentas-por-pagar")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "finanzas"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: CuentasPorPagarPage,
});

type Moneda = "DOP" | "USD" | "EUR";
type Estado = "pendiente" | "parcial" | "pagado" | "disputado";

type Row = {
  id: string;
  proveedor_nombre: string;
  proveedor_rnc: string | null;
  numero_factura: string | null;
  ncf_proveedor: string | null;
  monto_total: number;
  monto_pagado: number;
  moneda: Moneda;
  fecha_factura: string | null;
  fecha_vencimiento: string | null;
  estado: Estado;
  notas: string | null;
  gasto_id: string | null;
  gasto_operativo_id: string | null;
  expediente_id: string | null;
};


const fmtMoney = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado", disputado: "Disputado",
};

function EstadoBadge({ e }: { e: Estado }) {
  const cls: Record<Estado, string> = {
    pendiente: "bg-slate-100 text-slate-700 border-slate-300",
    parcial: "bg-amber-100 text-amber-800 border-amber-300",
    pagado: "bg-emerald-100 text-emerald-800 border-emerald-300",
    disputado: "bg-rose-100 text-rose-800 border-rose-300",
  };
  return <Badge variant="outline" className={cls[e]}>{ESTADO_LABEL[e]}</Badge>;
}

function VencimientoBadge({ fecha, estado }: { fecha: string | null; estado: Estado }) {
  if (!fecha || estado === "pagado") return <span className="text-muted-foreground text-xs">{fecha ? fmtLocalDate(fecha) : "—"}</span>;
  const d = daysFromToday(fecha);
  if (!isFinite(d)) return <span className="text-xs">{fmtLocalDate(fecha)}</span>;
  if (d < 0) return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">{fmtLocalDate(fecha)}</span>
      <Badge className="bg-red-600 hover:bg-red-600 text-white w-fit">Vencida ({Math.abs(d)}d)</Badge>
    </div>
  );
  if (d <= 7) return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">{fmtLocalDate(fecha)}</span>
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white w-fit">Vence en {d}d</Badge>
    </div>
  );
  return <span className="text-xs">{fmtLocalDate(fecha)}</span>;
}

const emptyForm = {
  proveedor_nombre: "",
  proveedor_rnc: "",
  numero_factura: "",
  ncf_proveedor: "",

  monto_total: "" as string,
  moneda: "DOP" as Moneda,
  fecha_factura: "" as string,
  fecha_vencimiento: "" as string,
  notas: "",
  gasto_id: "" as string,
  gasto_operativo_id: "" as string,
};

function CuentasPorPagarPage() {
  const qc = useQueryClient();
  const [fEstado, setFEstado] = useState<string>("todos");
  const [fMoneda, setFMoneda] = useState<string>("todas");
  const [fProveedor, setFProveedor] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [payRow, setPayRow] = useState<Row | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [askDisputado, setAskDisputado] = useState(false);
  const [delRow, setDelRow] = useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cxp", fEstado, fMoneda, fProveedor],
    queryFn: async () => {
      let q = (supabase.from as any)("cuentas_por_pagar")
        .select("*")
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });
      if (fEstado !== "todos") q = q.eq("estado", fEstado);
      if (fMoneda !== "todas") q = q.eq("moneda", fMoneda);
      if (fProveedor.trim()) q = q.ilike("proveedor_nombre", `%${fProveedor.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: gastosExp = [] } = useQuery({
    queryKey: ["cxp-gastos-exp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("gastos")
        .select("id, concepto, monto, moneda, fecha, rnc_cedula_proveedor, expediente_id")
        .is("deleted_at" as any, null)
        .order("fecha", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const { data: gastosOp = [] } = useQuery({
    queryKey: ["cxp-gastos-op"],
    queryFn: async () => {
      const { data } = await supabase
        .from("gastos_operativos")
        .select("id, concepto, monto, moneda, fecha, rnc_cedula_proveedor")
        .is("eliminado_en" as any, null)
        .order("fecha", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const resumen = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      if (r.estado === "pagado") continue;
      const pend = Number(r.monto_total || 0) - Number(r.monto_pagado || 0);
      if (pend <= 0) continue;
      acc[r.moneda] = (acc[r.moneda] ?? 0) + pend;
    }
    return acc;
  }, [rows]);

  const createMut = useMutation({
    mutationFn: async () => {
      const monto = Number(form.monto_total);
      if (!form.proveedor_nombre.trim()) throw new Error("Proveedor requerido");
      if (!isFinite(monto) || monto <= 0) throw new Error("Monto total inválido");
      const { data: u } = await supabase.auth.getUser();
      let expediente_id: string | null = null;
      if (form.gasto_id) {
        const g = gastosExp.find((x: any) => x.id === form.gasto_id);
        expediente_id = (g as any)?.expediente_id ?? null;
      }
      const payload: any = {
        proveedor_nombre: form.proveedor_nombre.trim(),
        proveedor_rnc: form.proveedor_rnc.trim() || null,
        numero_factura: form.numero_factura.trim() || null,
        ncf_proveedor: form.ncf_proveedor.trim() || null,

        monto_total: monto,
        moneda: form.moneda,
        fecha_factura: form.fecha_factura || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        notas: form.notas.trim() || null,
        gasto_id: form.gasto_id || null,
        gasto_operativo_id: form.gasto_operativo_id || null,
        expediente_id,
        updated_by: u.user?.id ?? null,
      };
      if (editingId) {
        const { error } = await (supabase.from as any)("cuentas_por_pagar")
          .update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("cuentas_por_pagar")
          .insert({ ...payload, created_by: u.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Cuenta por pagar actualizada" : "Cuenta por pagar creada");
      setOpenNew(false); setForm(emptyForm); setEditingId(null);
      qc.invalidateQueries({ queryKey: ["cxp"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });


  const payMut = useMutation({
    mutationFn: async ({ row, monto, quitarDisputa }: { row: Row; monto: number; quitarDisputa: boolean }) => {
      if (!isFinite(monto) || monto <= 0) throw new Error("Monto inválido");
      const nuevoPagado = Number(row.monto_pagado || 0) + monto;
      let nuevoEstado: Estado = row.estado;
      if (row.estado === "disputado" && !quitarDisputa) {
        nuevoEstado = "disputado";
      } else if (nuevoPagado >= Number(row.monto_total)) {
        nuevoEstado = "pagado";
      } else if (nuevoPagado > 0) {
        nuevoEstado = "parcial";
      } else {
        nuevoEstado = "pendiente";
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase.from as any)("cuentas_por_pagar")
        .update({ monto_pagado: nuevoPagado, estado: nuevoEstado, updated_by: u.user?.id ?? null })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      setPayRow(null); setPayMonto(""); setAskDisputado(false);
      qc.invalidateQueries({ queryKey: ["cxp"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al registrar pago"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("cuentas_por_pagar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminada"); setDelRow(null);
      qc.invalidateQueries({ queryKey: ["cxp"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const handleOpenEdit = (r: Row) => {
    setEditingId(r.id);
    setForm({
      proveedor_nombre: r.proveedor_nombre ?? "",
      proveedor_rnc: r.proveedor_rnc ?? "",
      numero_factura: r.numero_factura ?? "",
      ncf_proveedor: r.ncf_proveedor ?? "",
      monto_total: r.monto_total != null ? String(r.monto_total) : "",
      moneda: (r.moneda ?? "DOP") as Moneda,
      fecha_factura: r.fecha_factura ?? "",
      fecha_vencimiento: r.fecha_vencimiento ?? "",
      notas: r.notas ?? "",
      gasto_id: r.gasto_id ?? "",
      gasto_operativo_id: r.gasto_operativo_id ?? "",
    });
    setOpenNew(true);
  };

  const handleOpenPay = (r: Row) => {
    setPayRow(r); setPayMonto(""); setAskDisputado(false);
  };

  const submitPay = () => {
    if (!payRow) return;
    const monto = Number(payMonto);
    if (payRow.estado === "disputado" && !askDisputado) {
      setAskDisputado(true);
      return;
    }
    payMut.mutate({ row: payRow, monto, quitarDisputa: askDisputado });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuentas por Pagar</h1>
          <p className="text-sm text-muted-foreground">Pagos pendientes a proveedores, transportistas y agentes en el exterior.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(emptyForm); setOpenNew(true); }}><Plus className="h-4 w-4 mr-1" /> Nueva cuenta por pagar</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Total pendiente por pagar</CardTitle>
          <CardDescription>Suma de saldos abiertos, por moneda.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(resumen).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin saldos pendientes.</p>
          ) : (
            <div className="flex gap-6 flex-wrap">
              {Object.entries(resumen).map(([m, v]) => (
                <div key={m}>
                  <div className="text-xs text-muted-foreground">{m}</div>
                  <div className="text-xl font-semibold tabular-nums">{fmtMoney(v, m)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[160px]">
              <Label className="text-xs">Estado</Label>
              <Select value={fEstado} onValueChange={setFEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="disputado">Disputado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Label className="text-xs">Moneda</Label>
              <Select value={fMoneda} onValueChange={setFMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Proveedor</Label>
              <Input value={fProveedor} onChange={(e) => setFProveedor(e.target.value)} placeholder="Buscar por nombre…" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Proveedor</th>
                  <th className="text-left px-3 py-2">RNC</th>
                  <th className="text-left px-3 py-2">No. Factura</th>
                  <th className="text-left px-3 py-2">NCF</th>

                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Pagado</th>
                  <th className="text-right px-3 py-2">Saldo</th>
                  <th className="text-left px-3 py-2">Factura</th>
                  <th className="text-left px-3 py-2">Vencimiento</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={11} className="text-center py-6 text-muted-foreground">Cargando…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-6 text-muted-foreground">Sin cuentas por pagar.</td></tr>
                )}
                {rows.map((r) => {
                  const saldo = Number(r.monto_total || 0) - Number(r.monto_pagado || 0);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.proveedor_nombre}</div>
                        {r.notas && <div className="text-xs text-muted-foreground truncate max-w-[240px]">{r.notas}</div>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">{r.proveedor_rnc || "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{r.numero_factura || "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{r.ncf_proveedor || "—"}</td>

                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(r.monto_total), r.moneda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(r.monto_pagado), r.moneda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(saldo, r.moneda)}</td>
                      <td className="px-3 py-2 text-xs">{fmtLocalDate(r.fecha_factura)}</td>
                      <td className="px-3 py-2"><VencimientoBadge fecha={r.fecha_vencimiento} estado={r.estado} /></td>
                      <td className="px-3 py-2"><EstadoBadge e={r.estado} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleOpenEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleOpenPay(r)} disabled={r.estado === "pagado"}>
                            <CreditCard className="h-3.5 w-3.5 mr-1" /> Pago
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDelRow(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Nueva cuenta */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva cuenta por pagar</DialogTitle>
            <DialogDescription>Registro manual de un pago pendiente a un proveedor.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Escanea la factura del proveedor y edita los datos antes de guardar.
              </span>
              <EscanearFacturaCxpButton
                onExtracted={(d) =>
                  setForm((f) => ({
                    ...f,
                    proveedor_nombre: d.proveedor_nombre ?? f.proveedor_nombre,
                    proveedor_rnc: d.proveedor_rnc ?? f.proveedor_rnc,
                    numero_factura: d.numero_factura ?? f.numero_factura,
                    ncf_proveedor: d.ncf_proveedor ?? f.ncf_proveedor,
                    fecha_factura: d.fecha_factura ?? f.fecha_factura,
                    monto_total: d.monto_total !== null ? String(d.monto_total) : f.monto_total,
                  }))
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Proveedor *</Label>
              <Input value={form.proveedor_nombre} onChange={(e) => setForm({ ...form, proveedor_nombre: e.target.value })} />
            </div>
            <div>
              <Label>RNC / Cédula</Label>
              <Input value={form.proveedor_rnc} onChange={(e) => setForm({ ...form, proveedor_rnc: e.target.value })} />
            </div>
            <div>
              <Label>No. de factura</Label>
              <Input value={form.numero_factura} onChange={(e) => setForm({ ...form, numero_factura: e.target.value })} />
            </div>
            <div>
              <Label>NCF del proveedor</Label>
              <Input value={form.ncf_proveedor} onChange={(e) => setForm({ ...form, ncf_proveedor: e.target.value.toUpperCase() })} />
            </div>

            <div>
              <Label>Moneda</Label>
              <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v as Moneda })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto total *</Label>
              <Input type="number" step="0.01" value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} />
            </div>
            <div>
              <Label>Fecha factura</Label>
              <Input type="date" value={form.fecha_factura} onChange={(e) => setForm({ ...form, fecha_factura: e.target.value })} />
            </div>
            <div>
              <Label>Fecha vencimiento</Label>
              <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Vincular a gasto de expediente (opcional)</Label>
              <Select value={form.gasto_id || "none"} onValueChange={(v) => setForm({ ...form, gasto_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vínculo</SelectItem>
                  {gastosExp.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      {fmtLocalDate(g.fecha)} · {g.concepto} · {fmtMoney(Number(g.monto), g.moneda)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Vincular a gasto operativo (opcional)</Label>
              <Select value={form.gasto_operativo_id || "none"} onValueChange={(v) => setForm({ ...form, gasto_operativo_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vínculo</SelectItem>
                  {gastosOp.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      {fmtLocalDate(g.fecha)} · {g.concepto} · {fmtMoney(Number(g.monto), g.moneda)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={!!payRow} onOpenChange={(o) => { if (!o) { setPayRow(null); setAskDisputado(false); setPayMonto(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            {payRow && (
              <DialogDescription>
                {payRow.proveedor_nombre} · Saldo: {fmtMoney(Number(payRow.monto_total) - Number(payRow.monto_pagado), payRow.moneda)}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto ({payRow?.moneda})</Label>
              <Input type="number" step="0.01" value={payMonto} onChange={(e) => setPayMonto(e.target.value)} autoFocus />
            </div>
            {payRow?.estado === "disputado" && askDisputado && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                Esta cuenta está marcada como <strong>disputada</strong>. ¿Deseas quitar ese estado al registrar el pago?
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    payMut.mutate({ row: payRow!, monto: Number(payMonto), quitarDisputa: false });
                  }}>Mantener disputado</Button>
                  <Button size="sm" onClick={() => {
                    payMut.mutate({ row: payRow!, monto: Number(payMonto), quitarDisputa: true });
                  }}>Quitar disputa</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayRow(null); setAskDisputado(false); }}>Cancelar</Button>
            {!(payRow?.estado === "disputado" && askDisputado) && (
              <Button onClick={submitPay} disabled={payMut.isPending}>Registrar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delRow} onOpenChange={(o) => { if (!o) setDelRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cuenta por pagar</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo administradores pueden eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => delRow && delMut.mutate(delRow.id)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
