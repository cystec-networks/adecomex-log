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
import { Checkbox } from "@/components/ui/checkbox";

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
  total_itbis: number | null;
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
  es_retencion?: boolean | null;
  lote_pago?: string | null;
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

  const [aplicarOpen, setAplicarOpen] = useState(false);
  const [payCliente, setPayCliente] = useState("");
  const [sel, setSel] = useState<Record<string, { ret: boolean; monto: string }>>({});
  const [payFecha, setPayFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMetodo, setPayMetodo] = useState("Transferencia");
  const [payRef, setPayRef] = useState("");
  const [payNotas, setPayNotas] = useState("");

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["cxc-facturas"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("facturas_ecf")
        .select("id, encf, cliente_razon_social, cliente_rnc, fecha_emision, fecha_vencimiento_pago, monto_total, total_itbis, estado")

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

  const clientesConSaldo = useMemo(() => {
    const s = new Set<string>();
    for (const f of enriquecidas) if (f.saldo > 0) s.add(f.cliente_razon_social ?? "—");
    return Array.from(s).sort();
  }, [enriquecidas]);

  const facturasCliente = useMemo(
    () => enriquecidas.filter((f) => f.saldo > 0 && (f.cliente_razon_social ?? "—") === payCliente),
    [enriquecidas, payCliente],
  );

  const retencionDe = (f: { total_itbis: number | null }) =>
    +(((Number(f.total_itbis) || 0) * 0.3).toFixed(2));

  const marcadas = useMemo(
    () => facturasCliente.filter((f) => !!sel[f.id]),
    [facturasCliente, sel],
  );

  const resumen = useMemo(() => {
    let efectivo = 0, retenciones = 0;
    for (const f of marcadas) {
      const s = sel[f.id];
      efectivo += Number(s?.monto) || 0;
      if (s?.ret) retenciones += Math.min(retencionDe(f), f.saldo);
    }
    return {
      efectivo: +efectivo.toFixed(2),
      retenciones: +retenciones.toFixed(2),
      total: +(efectivo + retenciones).toFixed(2),
    };
  }, [marcadas, sel]);

  const abrirAplicar = (f?: (typeof enriquecidas)[number]) => {
    if (f) {
      setPayCliente(f.cliente_razon_social ?? "—");
      const ret = 0;
      setSel({ [f.id]: { ret: false, monto: String(+(f.saldo - ret).toFixed(2)) } });
    } else {
      setPayCliente(""); setSel({});
    }
    setPayFecha(new Date().toISOString().slice(0, 10));
    setPayMetodo("Transferencia"); setPayRef(""); setPayNotas("");
    setAplicarOpen(true);
  };

  const toggleFactura = (f: (typeof enriquecidas)[number]) => {
    setSel((prev) => {
      const next = { ...prev };
      if (next[f.id]) delete next[f.id];
      else next[f.id] = { ret: false, monto: String(f.saldo) };
      return next;
    });
  };

  const toggleRetencion = (f: (typeof enriquecidas)[number], on: boolean) => {
    setSel((prev) => {
      const cur = prev[f.id];
      if (!cur) return prev;
      const ret = on ? Math.min(retencionDe(f), f.saldo) : 0;
      const max = +(f.saldo - ret).toFixed(2);
      return { ...prev, [f.id]: { ret: on, monto: String(Math.max(0, max)) } };
    });
  };

  const aplicarPago = useMutation({
    mutationFn: async () => {
      if (marcadas.length === 0) throw new Error("Selecciona al menos una factura");
      if (resumen.total <= 0) throw new Error("El total aplicado debe ser mayor que cero");
      const { data: u } = await supabase.auth.getUser();
      const lote = crypto.randomUUID();
      const rows: any[] = [];
      for (const f of marcadas) {
        const s = sel[f.id]!;
        const ret = s.ret ? Math.min(retencionDe(f), f.saldo) : 0;
        const monto = +(Number(s.monto) || 0).toFixed(2);
        if (monto < 0) throw new Error("Monto inválido");
        if (monto > +(f.saldo - ret).toFixed(2) + 0.001)
          throw new Error(`El monto de ${f.encf} excede el saldo disponible`);
        if (monto > 0) {
          rows.push({
            factura_id: f.id, monto, fecha_pago: payFecha, metodo_pago: payMetodo,
            referencia: payRef || null, notas: payNotas || null,
            creado_por: u.user?.id ?? null, es_retencion: false, lote_pago: lote,
          });
        }
        if (ret > 0) {
          rows.push({
            factura_id: f.id, monto: ret, fecha_pago: payFecha,
            metodo_pago: "Retención ITBIS 30% DGII",
            referencia: payRef || null, notas: payNotas || null,
            creado_por: u.user?.id ?? null, es_retencion: true, lote_pago: lote,
          });
        }
      }
      if (rows.length === 0) throw new Error("No hay montos que aplicar");
      const { error } = await (supabase.from as any)("cxc_pagos").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago aplicado");
      setAplicarOpen(false); setSel({}); setPayRef(""); setPayNotas("");
      qc.invalidateQueries({ queryKey: ["cxc-pagos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo aplicar el pago"),
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
      <div className="flex flex-wrap items-center gap-2">
        <HandCoins className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-display font-bold">Cuentas por Cobrar</h1>
        <Button className="ml-auto" onClick={() => abrirAplicar()}>Aplicar pago</Button>
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
                      <td className="py-2 px-2 font-mono text-xs">
                        <Link
                          to="/admin/facturacion"
                          search={{ editar: f.id }}
                          className="text-primary hover:underline"
                        >
                          {f.encf}
                        </Link>
                      </td>

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
                          <Button size="sm" variant="outline" onClick={() => abrirAplicar(f)}>
                            Registrar pago
                          </Button>
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
                                    <td className="py-1">
                                      <span className="inline-flex items-center gap-1">
                                        {p.metodo_pago ?? "—"}
                                        {p.es_retencion && (
                                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                            Retención ITBIS
                                          </Badge>
                                        )}
                                      </span>
                                    </td>
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
            <tfoot>
              <tr className="border-t-2 bg-muted/60 font-semibold text-sm">
                <td className="py-2 px-2" colSpan={5}>Totales filtrados</td>
                <td className="py-2 px-2 text-right">{fmtRD(filtradas.reduce((s, f) => s + f.monto_total, 0))}</td>
                <td className="py-2 px-2 text-right">{fmtRD(filtradas.reduce((s, f) => s + f.pagado, 0))}</td>
                <td className="py-2 px-2 text-right">{fmtRD(filtradas.reduce((s, f) => s + f.saldo, 0))}</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Dialog open={aplicarOpen} onOpenChange={(o) => setAplicarOpen(o)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aplicar pago</DialogTitle>
            <DialogDescription>
              Aplica un mismo pago a una o varias facturas del cliente, con retención de ITBIS 30% (DGII) opcional por factura.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Cliente</Label>
              <Select value={payCliente} onValueChange={(v) => { setPayCliente(v); setSel({}); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un cliente…" /></SelectTrigger>
                <SelectContent>
                  {clientesConSaldo.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {payCliente && (
              <div className="rounded-md border divide-y">
                {facturasCliente.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">Este cliente no tiene facturas con saldo.</div>
                )}
                {facturasCliente.map((f) => {
                  const s = sel[f.id];
                  const ret = s?.ret ? Math.min(retencionDe(f), f.saldo) : 0;
                  const max = +(f.saldo - ret).toFixed(2);
                  return (
                    <div key={f.id} className="p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <Checkbox checked={!!s} onCheckedChange={() => toggleFactura(f)} className="mt-1" />
                        <div className="flex-1">
                          <div className="font-mono text-xs">{f.encf}</div>
                          <div className="text-xs text-muted-foreground">
                            Emitida {fmtLocalDate(f.fecha_emision)} · Saldo {fmtRD(f.saldo)}
                          </div>
                        </div>
                      </div>
                      {s && (
                        <div className="grid gap-3 sm:grid-cols-3 pl-7">
                          <div className="flex items-center gap-2 sm:col-span-2">
                            <Checkbox
                              id={`ret-${f.id}`}
                              checked={s.ret}
                              onCheckedChange={(v) => toggleRetencion(f, !!v)}
                            />
                            <Label htmlFor={`ret-${f.id}`} className="text-xs">
                              Retención ITBIS 30% (DGII)
                              {s.ret && <span className="ml-2 font-semibold text-amber-700">{fmtRD(ret)}</span>}
                            </Label>
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Monto a pagar (máx. {fmtRD(max)})</Label>
                            <Input
                              type="number" step="0.01" min="0" max={max}
                              value={s.monto}
                              onChange={(e) =>
                                setSel((prev) => ({ ...prev, [f.id]: { ...prev[f.id]!, monto: e.target.value } }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
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

            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Total en efectivo/transferencia</span><span>{fmtRD(resumen.efectivo)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Total en retenciones ITBIS</span><span>{fmtRD(resumen.retenciones)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Total aplicado a facturas</span><span>{fmtRD(resumen.total)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAplicarOpen(false)}>Cancelar</Button>
            <Button onClick={() => aplicarPago.mutate()} disabled={aplicarPago.isPending || marcadas.length === 0}>
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

type FilaCxC = {
  id: string;
  encf: string;
  cliente_razon_social: string | null;
  cliente_rnc: string | null;
  fecha_emision: string;
  fecha_vencimiento_pago: string | null;
  monto_total: number;
  pagado: number;
  saldo: number;
  diasVencido: number;
  bucket: Bucket;
};

function EstadoCuentaCard({ filas }: { filas: FilaCxC[] }) {
  const [cliente, setCliente] = useState("");
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef<string>("EstadoCuenta.pdf");

  const clientes = useMemo(() => {
    const s = new Set<string>();
    for (const f of filas) if (f.cliente_razon_social) s.add(f.cliente_razon_social);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [filas]);

  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generar = async () => {
    if (!cliente) { toast.error("Selecciona un cliente"); return; }
    const sel = filas
      .filter((f) => (f.cliente_razon_social ?? "") === cliente)
      .filter((f) => f.fecha_emision >= desde && f.fecha_emision <= hasta)
      .sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision));
    if (sel.length === 0) { toast.error("No hay facturas de ese cliente en el período"); return; }

    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const nf = (n: number) => (Number(n) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 32;

    const rnc = sel.find((f) => f.cliente_rnc)?.cliente_rnc ?? "—";

    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
    doc.setFontSize(11);
    doc.text("ESTADO DE CUENTA", M, 58);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(`Cliente: ${cliente}   |   RNC: ${rnc}`, M, 72);
    doc.text(
      `Período: ${fmtLocalDate(desde)} — ${fmtLocalDate(hasta)}   |   Generado: ${new Date().toLocaleString("es-DO")}`,
      M, 84,
    );
    doc.setTextColor(0);

    const tot = sel.reduce(
      (a, f) => ({
        monto: a.monto + Number(f.monto_total || 0),
        pagado: a.pagado + Number(f.pagado || 0),
        saldo: a.saldo + Number(f.saldo || 0),
      }),
      { monto: 0, pagado: 0, saldo: 0 },
    );

    autoTable(doc, {
      startY: 96,
      head: [["eNCF", "Emisión", "Vencimiento", "Monto", "Pagado", "Saldo", "Días venc."]],
      body: sel.map((f) => [
        f.encf,
        fmtLocalDate(f.fecha_emision),
        f.fecha_vencimiento_pago ? fmtLocalDate(f.fecha_vencimiento_pago) : "—",
        nf(f.monto_total),
        nf(f.pagado),
        nf(f.saldo),
        f.diasVencido > 0 ? String(f.diasVencido) : "—",
      ]),
      foot: [["TOTALES", "", "", nf(tot.monto), nf(tot.pagado), nf(tot.saldo), ""]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      footStyles: { fillColor: [235, 239, 245], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
      },
      margin: { left: M, right: M },
    });

    let y = (doc as any).lastAutoTable.finalY + 16;

    autoTable(doc, {
      startY: y,
      head: [["Resumen", "RD$"]],
      body: [
        ["Total Facturado", nf(tot.monto)],
        ["Total Pagado", nf(tot.pagado)],
        ["Total Pendiente", nf(tot.saldo)],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 140 }, 1: { halign: "right" } },
      margin: { left: M, right: M },
      tableWidth: 260,
      didParseCell: (d: any) => {
        if (d.section === "body" && d.row.index === 2) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fillColor = [255, 240, 240];
          d.cell.styles.textColor = [150, 20, 20];
        }
      },
    });

    const yResumen = (doc as any).lastAutoTable.finalY;

    const antig: Record<Bucket, number> = { al_dia: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_mas": 0 };
    for (const f of sel) if (f.saldo > 0) antig[f.bucket] += f.saldo;

    autoTable(doc, {
      startY: y,
      head: [["Antigüedad de saldos", "RD$"]],
      body: BUCKETS.map((b) => [b.label, nf(antig[b.key])]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 140 }, 1: { halign: "right" } },
      margin: { left: M + 280, right: M },
      tableWidth: 260,
    });

    y = Math.max(yResumen, (doc as any).lastAutoTable.finalY) + 22;
    doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text(
      "Este estado de cuenta refleja los pagos aplicados hasta la fecha de generación. Cualquier pago reciente puede no estar reflejado.",
      M, Math.min(y, pageH - 40), { maxWidth: pageW - M * 2 },
    );
    doc.setTextColor(0);

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
    }

    fileNameRef.current = `EstadoCuenta_${cliente.replace(/\s+/g, "")}_${desde}_${hasta}.pdf`;
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(doc.output("bloburl").toString());
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Generar Estado de Cuenta</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5 min-w-64">
          <Label className="text-xs">Cliente</Label>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Desde</Label>
          <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button onClick={generar}>
          <FileText className="h-4 w-4 mr-1" /> Generar PDF
        </Button>
      </CardContent>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Estado de Cuenta</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Estado de Cuenta" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
