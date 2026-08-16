import { createFileRoute, redirect } from "@tanstack/react-router";
import { Fragment, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, HandCoins, FileText } from "lucide-react";
import { fmtLocalDate, daysFromToday } from "@/lib/dates";
import { fmtRD } from "@/lib/facturas-ecf";


export const Route = createFileRoute("/_authenticated/admin/cuentas-por-cobrar")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Cuentas por Cobrar | ADECOMEX" },
      { name: "description", content: "Aplica pagos de clientes sobre facturas fiscales emitidas y controla la antigüedad de saldos." },
      { property: "og:title", content: "Cuentas por Cobrar | ADECOMEX" },
      { property: "og:description", content: "Control de cobros y antigüedad de saldos sobre comprobantes fiscales electrónicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CuentasPorCobrarPage,
});

type Factura = {
  id: string;
  encf: string;
  cliente_razon_social: string | null;
  cliente_rnc: string | null;
  fecha_emision: string;
  fecha_vencimiento_pago: string | null;
  monto_total: number;
  estado: string;
};

type Pago = {
  id: string;
  factura_id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string | null;
  referencia: string | null;
  notas: string | null;
  creado_por: string | null;
};

type Bucket = "al_dia" | "1_30" | "31_60" | "61_90" | "90_mas";

const BUCKETS: { key: Bucket; label: string; cls: string }[] = [
  { key: "al_dia", label: "Al día", cls: "border-emerald-300 bg-emerald-50" },
  { key: "1_30", label: "1-30 días", cls: "border-amber-300 bg-amber-50" },
  { key: "31_60", label: "31-60 días", cls: "border-orange-300 bg-orange-50" },
  { key: "61_90", label: "61-90 días", cls: "border-rose-300 bg-rose-50" },
  { key: "90_mas", label: "90+ días", cls: "border-red-400 bg-red-50" },
];

function bucketDe(diasVencido: number): Bucket {
  if (diasVencido <= 0) return "al_dia";
  if (diasVencido <= 30) return "1_30";
  if (diasVencido <= 60) return "31_60";
  if (diasVencido <= 90) return "61_90";
  return "90_mas";
}

const METODOS = ["Transferencia", "Cheque", "Efectivo", "Otro"];

function CuentasPorCobrarPage() {
  const qc = useQueryClient();
  const [fCliente, setFCliente] = useState("");
  const [fBucket, setFBucket] = useState<Bucket | "todos">("todos");
  const [soloSaldo, setSoloSaldo] = useState(true);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const [payRow, setPayRow] = useState<(Factura & { saldo: number }) | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [payFecha, setPayFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMetodo, setPayMetodo] = useState("Transferencia");
  const [payRef, setPayRef] = useState("");
  const [payNotas, setPayNotas] = useState("");

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["cxc-facturas"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("facturas_ecf")
        .select("id, encf, cliente_razon_social, cliente_rnc, fecha_emision, fecha_vencimiento_pago, monto_total, estado")
        .is("eliminado_en", null)
        .neq("estado", "anulada")
        .order("fecha_emision", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Factura[];
    },
  });

  const { data: pagos = [] } = useQuery({
    queryKey: ["cxc-pagos"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("cxc_pagos")
        .select("*")
        .order("fecha_pago", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pago[];
    },
  });

  const pagosPorFactura = useMemo(() => {
    const m: Record<string, Pago[]> = {};
    for (const p of pagos) (m[p.factura_id] ??= []).push(p);
    return m;
  }, [pagos]);

  const enriquecidas = useMemo(() => {
    return facturas.map((f) => {
      const ps = pagosPorFactura[f.id] ?? [];
      const pagado = ps.reduce((s, p) => s + Number(p.monto || 0), 0);
      const total = Number(f.monto_total || 0);
      const saldo = +(total - pagado).toFixed(2);
      const estado = saldo <= 0 ? "Pagada" : pagado > 0 ? "Parcial" : "Pendiente";
      const d = f.fecha_vencimiento_pago ? -daysFromToday(f.fecha_vencimiento_pago) : NaN;
      const diasVencido = isFinite(d) && d > 0 && saldo > 0 ? Math.round(d) : 0;
      return { ...f, pagado, saldo, estadoPago: estado, diasVencido, bucket: bucketDe(diasVencido) };
    });
  }, [facturas, pagosPorFactura]);

  const totalesBucket = useMemo(() => {
    const t: Record<Bucket, number> = { al_dia: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_mas": 0 };
    for (const f of enriquecidas) if (f.saldo > 0) t[f.bucket] += f.saldo;
    return t;
  }, [enriquecidas]);

  const filtradas = useMemo(() => {
    const q = fCliente.trim().toLowerCase();
    return enriquecidas.filter((f) => {
      if (soloSaldo && f.saldo <= 0) return false;
      if (fBucket !== "todos" && !(f.saldo > 0 && f.bucket === fBucket)) return false;
      if (q && !`${f.cliente_razon_social ?? ""} ${f.cliente_rnc ?? ""} ${f.encf}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriquecidas, fCliente, fBucket, soloSaldo]);

  const registrarPago = useMutation({
    mutationFn: async () => {
      if (!payRow) return;
      const monto = Number(payMonto);
      if (!isFinite(monto) || monto <= 0) throw new Error("Monto inválido");
      if (monto > payRow.saldo + 0.001) throw new Error("El monto excede el saldo pendiente");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase.from as any)("cxc_pagos").insert({
        factura_id: payRow.id,
        monto,
        fecha_pago: payFecha,
        metodo_pago: payMetodo,
        referencia: payRef || null,
        notas: payNotas || null,
        creado_por: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      setPayRow(null); setPayMonto(""); setPayRef(""); setPayNotas("");
      qc.invalidateQueries({ queryKey: ["cxc-pagos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo registrar el pago"),
  });

  const setVencimiento = useMutation({
    mutationFn: async ({ id, fecha }: { id: string; fecha: string }) => {
      const { error } = await (supabase.from as any)("facturas_ecf")
        .update({ fecha_vencimiento_pago: fecha || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fecha de vencimiento actualizada");
      qc.invalidateQueries({ queryKey: ["cxc-facturas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <HandCoins className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-display font-bold">Cuentas por Cobrar</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <Card
            key={b.key}
            onClick={() => setFBucket((prev) => (prev === b.key ? "todos" : b.key))}
            className={`cursor-pointer transition-all ${b.cls} ${fBucket === b.key ? "ring-2 ring-primary" : ""}`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{fmtRD(totalesBucket[b.key])}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EstadoCuentaCard filas={enriquecidas} />



      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Facturas emitidas</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar cliente, RNC o eNCF…"
              value={fCliente}
              onChange={(e) => setFCliente(e.target.value)}
              className="w-64"
            />
            {fBucket !== "todos" && (
              <Button variant="ghost" size="sm" onClick={() => setFBucket("todos")}>Quitar filtro de antigüedad</Button>
            )}
            <div className="flex items-center gap-2">
              <Switch id="solo-saldo" checked={soloSaldo} onCheckedChange={setSoloSaldo} />
              <Label htmlFor="solo-saldo" className="text-sm">Solo con saldo pendiente</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 w-8" />
                <th className="py-2 px-2">eNCF</th>
                <th className="py-2 px-2">Cliente</th>
                <th className="py-2 px-2">Emisión</th>
                <th className="py-2 px-2">Vence pago</th>
                <th className="py-2 px-2 text-right">Monto</th>
                <th className="py-2 px-2 text-right">Pagado</th>
                <th className="py-2 px-2 text-right">Saldo</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2 text-right">Días vencido</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && filtradas.length === 0 && (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Sin facturas para mostrar</td></tr>
              )}
              {filtradas.map((f) => {
                const ps = pagosPorFactura[f.id] ?? [];
                const abierto = !!expandido[f.id];
                return (
                  <Fragment key={f.id}>
                    <tr className="border-b hover:bg-muted/40">
                      <td className="py-2 px-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setExpandido((p) => ({ ...p, [f.id]: !p[f.id] }))}
                          title="Ver historial de pagos">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">{f.encf}</td>
                      <td className="py-2 px-2">
                        <div>{f.cliente_razon_social ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{f.cliente_rnc ?? ""}</div>
                      </td>
                      <td className="py-2 px-2 text-xs">{fmtLocalDate(f.fecha_emision)}</td>
                      <td className="py-2 px-2 text-xs">
                        {f.fecha_vencimiento_pago ? (
                          fmtLocalDate(f.fecha_vencimiento_pago)
                        ) : (
                          <Input
                            type="date"
                            className="h-8 w-36"
                            onChange={(e) => e.target.value && setVencimiento.mutate({ id: f.id, fecha: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">{fmtRD(f.monto_total)}</td>
                      <td className="py-2 px-2 text-right">{fmtRD(f.pagado)}</td>
                      <td className="py-2 px-2 text-right font-semibold">{fmtRD(f.saldo)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={
                          f.estadoPago === "Pagada" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : f.estadoPago === "Parcial" ? "bg-amber-100 text-amber-800 border-amber-300"
                              : "bg-slate-100 text-slate-700 border-slate-300"
                        }>{f.estadoPago}</Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {f.diasVencido > 0
                          ? <span className="text-red-600 font-medium">{f.diasVencido}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {f.saldo > 0 && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setPayRow(f);
                            setPayMonto(String(f.saldo));
                            setPayFecha(new Date().toISOString().slice(0, 10));
                            setPayMetodo("Transferencia");
                            setPayRef(""); setPayNotas("");
                          }}>Registrar pago</Button>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-muted/30 border-b">
                        <td />
                        <td colSpan={10} className="py-2 px-2">
                          {ps.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-1">Sin pagos aplicados.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1">Fecha</th>
                                  <th className="py-1 text-right">Monto</th>
                                  <th className="py-1">Método</th>
                                  <th className="py-1">Referencia</th>
                                  <th className="py-1">Notas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ps.map((p) => (
                                  <tr key={p.id} className="border-t">
                                    <td className="py-1">{fmtLocalDate(p.fecha_pago)}</td>
                                    <td className="py-1 text-right">{fmtRD(p.monto)}</td>
                                    <td className="py-1">{p.metodo_pago ?? "—"}</td>
                                    <td className="py-1">{p.referencia ?? "—"}</td>
                                    <td className="py-1">{p.notas ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!payRow} onOpenChange={(o) => !o && setPayRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              {payRow ? `${payRow.encf} — saldo pendiente ${fmtRD(payRow.saldo)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Monto</Label>
              <Input type="number" step="0.01" value={payMonto} onChange={(e) => setPayMonto(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha de pago</Label>
              <Input type="date" value={payFecha} onChange={(e) => setPayFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Método de pago</Label>
              <Select value={payMetodo} onValueChange={setPayMetodo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Referencia</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notas</Label>
              <Textarea value={payNotas} onChange={(e) => setPayNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)}>Cancelar</Button>
            <Button onClick={() => registrarPago.mutate()} disabled={registrarPago.isPending}>Guardar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
