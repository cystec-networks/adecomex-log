import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Copy, AlertTriangle } from "lucide-react";
import { TIPOS_BIENES_SERVICIOS, TIPOS_RETENCION_ISR } from "@/lib/fiscal-606";

export const Route = createFileRoute("/_authenticated/admin/gastos-operativos")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin","contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: GastosOperativosPage,
});

const CONCEPTOS = [
  "Nómina", "Alquiler", "Servicios (luz/agua/internet)", "Comunicaciones",
  "Combustible administrativo", "Mantenimiento oficina", "Software / SaaS",
  "Contabilidad / Legal", "Impuestos", "Bancarios", "Marketing",
  "Suministros de oficina", "Otros",
];

const fmt = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}`;

function ymOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

type Moneda = "DOP" | "USD" | "EUR";
type TipoId = "RNC" | "CEDULA" | "PASAPORTE";
type FormaPago = "efectivo" | "cheque_transferencia" | "tarjeta" | "credito" | "permuta" | "nota_credito" | "mixto";
type Row = {
  id: string; concepto: string; monto: number; moneda: Moneda; fecha: string;
  es_recurrente: boolean; comprobante_url: string | null; notas: string | null;
  rnc_cedula_proveedor?: string | null;
  tipo_id_proveedor?: TipoId | null;
  ncf_proveedor?: string | null;
  tipo_ncf_proveedor?: string | null;
  ncf_modificado?: string | null;
  monto_facturado?: number | null;
  itbis_facturado?: number | null;
  itbis_retenido?: number | null;
  isr_retenido?: number | null;
  forma_pago?: FormaPago | null;
  tipo_bienes_servicios?: number | null;
  monto_facturado_servicios?: number | null;
  monto_facturado_bienes?: number | null;
  tipo_retencion_isr?: number | null;
  itbis_proporcionalidad_349?: number | null;
  itbis_llevado_costo?: number | null;
  itbis_percibido_compras?: number | null;
  isr_percibido_compras?: number | null;
  impuesto_selectivo_consumo?: number | null;
  otros_impuestos_tasas?: number | null;
  monto_propina_legal?: number | null;
};

const RNC_RE = /^(\d{9}|\d{11})$/;
const NCF_RE = /^[A-Za-z0-9]{11}$|^[A-Za-z0-9]{13}$/;

function GastosOperativosPage() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<Row | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const prevFrom = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const prevTo = new Date(anchor.getFullYear(), anchor.getMonth(), 0);

  const { data, isLoading } = useQuery({
    queryKey: ["gastos-op", ymOf(anchor)],
    queryFn: async () => {
      const [cur, prev] = await Promise.all([
        supabase.from("gastos_operativos").select("*")
          .is("eliminado_en", null)
          .gte("fecha", fromStr).lte("fecha", toStr)
          .order("fecha", { ascending: false }),
        supabase.from("gastos_operativos").select("*")
          .is("eliminado_en", null).eq("es_recurrente", true)
          .gte("fecha", prevFrom.toISOString().slice(0, 10))
          .lte("fecha", prevTo.toISOString().slice(0, 10)),
      ]);
      if (cur.error) throw cur.error;
      if (prev.error) throw prev.error;
      return { rows: (cur.data ?? []) as Row[], prevRecurrentes: (prev.data ?? []) as Row[] };
    },
  });

  const rows = data?.rows ?? [];
  const totalDOP = useMemo(() =>
    rows.filter(r => r.moneda === "DOP").reduce((s, r) => s + Number(r.monto || 0), 0), [rows]);
  const totalUSD = useMemo(() =>
    rows.filter(r => r.moneda === "USD").reduce((s, r) => s + Number(r.monto || 0), 0), [rows]);
  const recurrentes = rows.filter(r => r.es_recurrente).length;

  // Alerta: recurrentes del mes anterior aún no registrados este mes
  const conceptosEsteMes = new Set(rows.map(r => `${r.concepto}::${r.moneda}`));
  const faltantes = (data?.prevRecurrentes ?? []).filter(
    r => !conceptosEsteMes.has(`${r.concepto}::${r.moneda}`)
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gastos_operativos").update({
        eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Gasto eliminado"); qc.invalidateQueries({ queryKey: ["gastos-op"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const copiarRecurrentes = useMutation({
    mutationFn: async (ids: string[]) => {
      const items = (data?.prevRecurrentes ?? []).filter(r => ids.includes(r.id));
      const { data: u } = await supabase.auth.getUser();
      const newFecha = `${ymOf(anchor)}-${String(Math.min(new Date().getDate(), 28)).padStart(2, "0")}`;
      const payload = items.map(r => ({
        concepto: r.concepto, monto: r.monto, moneda: r.moneda,
        fecha: newFecha, es_recurrente: true, notas: r.notas,
        created_by: u.user?.id,
      }));
      if (!payload.length) return;
      const { error } = await supabase.from("gastos_operativos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recurrentes copiados"); setCopyOpen(false); qc.invalidateQueries({ queryKey: ["gastos-op"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Gastos Operativos</h1>
            <p className="text-sm text-muted-foreground">Gastos generales/fijos del negocio, independientes de expedientes y transportes.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>◄</Button>
            <div className="font-medium w-32 text-center capitalize">
              {anchor.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>►</Button>
            <Button onClick={() => setEditing({ id: "", concepto: "", monto: 0, moneda: "DOP", fecha: new Date().toISOString().slice(0, 10), es_recurrente: false, comprobante_url: null, notas: null, rnc_cedula_proveedor: null, tipo_id_proveedor: null, ncf_proveedor: null, tipo_ncf_proveedor: null, ncf_modificado: null, monto_facturado: 0, itbis_facturado: 0, itbis_retenido: 0, isr_retenido: 0, forma_pago: null })}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo gasto
            </Button>
          </div>
        </div>

        {faltantes.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  {faltantes.length} gasto{faltantes.length === 1 ? "" : "s"} recurrente{faltantes.length === 1 ? "" : "s"} del mes anterior aún no registrado{faltantes.length === 1 ? "" : "s"} este mes
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {faltantes.slice(0, 3).map(r => r.concepto).join(", ")}{faltantes.length > 3 ? "…" : ""}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
                <Copy className="h-4 w-4 mr-1" /> Revisar y copiar
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card><CardHeader className="pb-2"><CardDescription>Total del mes (DOP)</CardDescription><CardTitle>{fmt(totalDOP, "DOP")}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Total del mes (USD)</CardDescription><CardTitle>{fmt(totalUSD, "USD")}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Registros / Recurrentes</CardDescription><CardTitle>{rows.length} <span className="text-sm font-normal text-muted-foreground">/ {recurrentes} rec.</span></CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Gastos del mes</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="text-sm text-muted-foreground">Cargando…</div> :
             rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Sin gastos registrados este mes.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left border-b text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Concepto</th>
                      <th className="py-2 pr-3 text-right">Monto</th>
                      <th className="py-2 pr-3">Recurrente</th>
                      <th className="py-2 pr-3">Notas</th>
                      <th className="py-2 pr-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3 whitespace-nowrap">{r.fecha}</td>
                        <td className="py-2 pr-3">{r.concepto}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{fmt(Number(r.monto), r.moneda)}</td>
                        <td className="py-2 pr-3">{r.es_recurrente ? <Badge variant="secondary">Sí</Badge> : "—"}</td>
                        <td className="py-2 pr-3 text-muted-foreground truncate max-w-xs">{r.notas ?? ""}</td>
                        <td className="py-2 pr-3 text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("¿Eliminar este gasto?")) del.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["gastos-op"] }); }} />}
      {copyOpen && <CopyDialog items={faltantes} onClose={() => setCopyOpen(false)} onConfirm={(ids) => copiarRecurrentes.mutate(ids)} pending={copiarRecurrentes.isPending} />}
    </>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...row });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.concepto.trim()) throw new Error("Concepto requerido");
      if (!form.fecha) throw new Error("Fecha requerida");
      if (!(Number(form.monto) >= 0)) throw new Error("Monto inválido");
      const rnc = (form.rnc_cedula_proveedor ?? "").trim();
      const ncf = (form.ncf_proveedor ?? "").trim();
      const ncfMod = (form.ncf_modificado ?? "").trim();
      if (rnc && !RNC_RE.test(rnc)) throw new Error("RNC/Cédula debe tener 9 u 11 dígitos numéricos");
      if (ncf && !NCF_RE.test(ncf)) throw new Error("NCF debe tener 11 o 13 caracteres alfanuméricos");
      if (ncfMod && !NCF_RE.test(ncfMod)) throw new Error("NCF modificado debe tener 11 o 13 caracteres alfanuméricos");
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        concepto: form.concepto.trim(),
        monto: Number(form.monto),
        moneda: form.moneda,
        fecha: form.fecha,
        es_recurrente: form.es_recurrente,
        comprobante_url: form.comprobante_url,
        notas: form.notas,
        rnc_cedula_proveedor: rnc || null,
        tipo_id_proveedor: form.tipo_id_proveedor || null,
        ncf_proveedor: ncf || null,
        tipo_ncf_proveedor: (form.tipo_ncf_proveedor ?? "").trim() || null,
        ncf_modificado: ncfMod || null,
        monto_facturado: Number(form.monto_facturado_servicios ?? 0) + Number(form.monto_facturado_bienes ?? 0),
        monto_facturado_servicios: Number(form.monto_facturado_servicios ?? 0),
        monto_facturado_bienes: Number(form.monto_facturado_bienes ?? 0),
        itbis_facturado: Number(form.itbis_facturado ?? 0),
        itbis_retenido: Number(form.itbis_retenido ?? 0),
        isr_retenido: Number(form.isr_retenido ?? 0),
        forma_pago: form.forma_pago || null,
        tipo_bienes_servicios: form.tipo_bienes_servicios ?? null,
        tipo_retencion_isr: form.tipo_retencion_isr ?? null,
        itbis_proporcionalidad_349: Number(form.itbis_proporcionalidad_349 ?? 0),
        itbis_llevado_costo: Number(form.itbis_llevado_costo ?? 0),
        itbis_percibido_compras: Number(form.itbis_percibido_compras ?? 0),
        isr_percibido_compras: Number(form.isr_percibido_compras ?? 0),
        impuesto_selectivo_consumo: Number(form.impuesto_selectivo_consumo ?? 0),
        otros_impuestos_tasas: Number(form.otros_impuestos_tasas ?? 0),
        monto_propina_legal: Number(form.monto_propina_legal ?? 0),
      };
      if (row.id) {
        const { error } = await supabase.from("gastos_operativos").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gastos_operativos").insert({ ...payload, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Guardado"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row.id ? "Editar gasto operativo" : "Nuevo gasto operativo"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Concepto</Label>
            <Input list="conceptos-op" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Ej: Nómina, Alquiler…" />
            <datalist id="conceptos-op">{CONCEPTOS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto</Label>
              <Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
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
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.es_recurrente} onCheckedChange={(v) => setForm({ ...form, es_recurrente: !!v })} />
            <span className="text-sm">Es recurrente (se repite cada mes)</span>
          </label>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} />
          </div>

          <fieldset className="border rounded-md p-3 space-y-3">
            <legend className="text-sm font-semibold px-1">Datos fiscales del proveedor</legend>
            <p className="text-xs text-muted-foreground -mt-1">Opcional. Requerido solo si el gasto tiene comprobante fiscal formal (para reporte 606 DGII).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de ID</Label>
                <Select value={form.tipo_id_proveedor ?? ""} onValueChange={(v) => setForm({ ...form, tipo_id_proveedor: (v || null) as TipoId | null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RNC">RNC</SelectItem>
                    <SelectItem value="CEDULA">Cédula</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>RNC / Cédula</Label>
                <Input value={form.rnc_cedula_proveedor ?? ""} onChange={(e) => setForm({ ...form, rnc_cedula_proveedor: e.target.value })} placeholder="9 u 11 dígitos" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>NCF</Label>
                <Input value={form.ncf_proveedor ?? ""} onChange={(e) => setForm({ ...form, ncf_proveedor: e.target.value })} placeholder="11 o 13 caracteres" />
              </div>
              <div>
                <Label>Tipo NCF</Label>
                <Input value={form.tipo_ncf_proveedor ?? ""} onChange={(e) => setForm({ ...form, tipo_ncf_proveedor: e.target.value })} placeholder="Ej: 01, 02, 11…" />
              </div>
            </div>
            <div>
              <Label>NCF modificado (si aplica)</Label>
              <Input value={form.ncf_modificado ?? ""} onChange={(e) => setForm({ ...form, ncf_modificado: e.target.value })} placeholder="NCF original al que reemplaza (nota de crédito/débito)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo bienes / servicios (606)</Label>
                <Select value={form.tipo_bienes_servicios ? String(form.tipo_bienes_servicios) : ""} onValueChange={(v) => setForm({ ...form, tipo_bienes_servicios: v ? Number(v) : null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_BIENES_SERVICIOS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo retención ISR</Label>
                <Select value={form.tipo_retencion_isr ? String(form.tipo_retencion_isr) : ""} onValueChange={(v) => setForm({ ...form, tipo_retencion_isr: v ? Number(v) : null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_RETENCION_ISR.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto facturado servicios</Label>
                <Input type="number" step="0.01" value={form.monto_facturado_servicios ?? 0} onChange={(e) => setForm({ ...form, monto_facturado_servicios: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Monto facturado bienes</Label>
                <Input type="number" step="0.01" value={form.monto_facturado_bienes ?? 0} onChange={(e) => setForm({ ...form, monto_facturado_bienes: Number(e.target.value) })} />
              </div>
              <div>
                <Label>ITBIS facturado</Label>
                <Input type="number" step="0.01" value={form.itbis_facturado ?? 0} onChange={(e) => setForm({ ...form, itbis_facturado: Number(e.target.value) })} />
              </div>
              <div>
                <Label>ITBIS retenido</Label>
                <Input type="number" step="0.01" value={form.itbis_retenido ?? 0} onChange={(e) => setForm({ ...form, itbis_retenido: Number(e.target.value) })} />
              </div>
              <div>
                <Label>ISR retenido</Label>
                <Input type="number" step="0.01" value={form.isr_retenido ?? 0} onChange={(e) => setForm({ ...form, isr_retenido: Number(e.target.value) })} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Monto facturado total: <b>{(Number(form.monto_facturado_servicios ?? 0) + Number(form.monto_facturado_bienes ?? 0)).toFixed(2)}</b>
            </div>
            <div>
              <Label>Forma de pago</Label>
              <Select value={form.forma_pago ?? ""} onValueChange={(v) => setForm({ ...form, forma_pago: (v || null) as FormaPago | null })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="cheque_transferencia">Cheque / Transferencia</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="permuta">Permuta</SelectItem>
                  <SelectItem value="nota_credito">Nota de crédito</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <details className="rounded border bg-background/60">
              <summary className="cursor-pointer text-xs font-medium px-3 py-2 select-none">Detalles fiscales avanzados (opcional)</summary>
              <div className="p-3 space-y-2 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">ITBIS sujeto proporcionalidad (Art. 349)</Label><Input type="number" step="0.01" value={form.itbis_proporcionalidad_349 ?? 0} onChange={(e) => setForm({ ...form, itbis_proporcionalidad_349: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">ITBIS llevado al costo</Label><Input type="number" step="0.01" value={form.itbis_llevado_costo ?? 0} onChange={(e) => setForm({ ...form, itbis_llevado_costo: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">ITBIS percibido en compras</Label><Input type="number" step="0.01" value={form.itbis_percibido_compras ?? 0} onChange={(e) => setForm({ ...form, itbis_percibido_compras: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">ISR percibido en compras</Label><Input type="number" step="0.01" value={form.isr_percibido_compras ?? 0} onChange={(e) => setForm({ ...form, isr_percibido_compras: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Impuesto Selectivo al Consumo</Label><Input type="number" step="0.01" value={form.impuesto_selectivo_consumo ?? 0} onChange={(e) => setForm({ ...form, impuesto_selectivo_consumo: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Otros impuestos / tasas</Label><Input type="number" step="0.01" value={form.otros_impuestos_tasas ?? 0} onChange={(e) => setForm({ ...form, otros_impuestos_tasas: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Monto propina legal</Label><Input type="number" step="0.01" value={form.monto_propina_legal ?? 0} onChange={(e) => setForm({ ...form, monto_propina_legal: Number(e.target.value) })} /></div>
                </div>
              </div>
            </details>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({ items, onClose, onConfirm, pending }: { items: Row[]; onClose: () => void; onConfirm: (ids: string[]) => void; pending: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map(i => i.id)));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copiar recurrentes del mes anterior</DialogTitle>
          <DialogDescription>Se crearán con la fecha del mes en curso. Marca los que quieres copiar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-auto">
          {items.map(r => (
            <label key={r.id} className="flex items-center gap-2 border rounded p-2">
              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              <div className="flex-1">
                <div className="text-sm font-medium">{r.concepto}</div>
                <div className="text-xs text-muted-foreground">{fmt(Number(r.monto), r.moneda)} · {r.fecha}</div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(Array.from(selected))} disabled={pending || selected.size === 0}>
            Copiar {selected.size} gasto{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
