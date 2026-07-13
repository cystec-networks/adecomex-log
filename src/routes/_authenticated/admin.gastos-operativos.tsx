import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
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

export const Route = createFileRoute("/_authenticated/admin/gastos-operativos")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
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

type Row = {
  id: string; concepto: string; monto: number; moneda: string; fecha: string;
  es_recurrente: boolean; comprobante_url: string | null; notas: string | null;
};

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
    <AppShell>
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
            <Button onClick={() => setEditing({ id: "", concepto: "", monto: 0, moneda: "DOP", fecha: new Date().toISOString().slice(0, 10), es_recurrente: false, comprobante_url: null, notas: null })}>
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
    </AppShell>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...row });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.concepto.trim()) throw new Error("Concepto requerido");
      if (!form.fecha) throw new Error("Fecha requerida");
      if (!(Number(form.monto) >= 0)) throw new Error("Monto inválido");
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        concepto: form.concepto.trim(),
        monto: Number(form.monto),
        moneda: form.moneda,
        fecha: form.fecha,
        es_recurrente: form.es_recurrente,
        comprobante_url: form.comprobante_url,
        notas: form.notas,
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
      <DialogContent className="max-w-lg">
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
              <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
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
