import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/solicitudes-pago-transferencia")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "finanzas", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: SolicitudesPagoTransferenciaPage,
  head: () => ({
    meta: [
      { title: "Solicitudes de Pago por Transferencia | ADECOMEX" },
      { name: "description", content: "Captura y control de solicitudes internas de pago por transferencia bancaria." },
      { property: "og:title", content: "Solicitudes de Pago por Transferencia | ADECOMEX" },
      { property: "og:description", content: "Captura y control de solicitudes internas de pago por transferencia bancaria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  id: string;
  secuencia: string;
  fecha: string;
  categoria: string;
  factura_compra: string | null;
  beneficiario: string;
  concepto: string;
  monto: number;
  descuento_cxc: number | null;
  solicitud_transporte_id: string | null;
  created_at: string;
};

const CATEGORIAS = ["Gastos Menores", "Impuestos", "Nómina", "Compras con NCF", "Otro"];
const SIN_VINCULO = "__none__";

const fmtMoney = (n: number) =>
  `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const neto = (r: { monto: number; descuento_cxc: number | null }) =>
  Number(r.monto || 0) - Number(r.descuento_cxc || 0);

type FormState = {
  fecha: string;
  categoria: string;
  factura_compra: string;
  beneficiario: string;
  concepto: string;
  monto: string;
  descuento_cxc: string;
  solicitud_transporte_id: string;
};

const EMPTY_FORM: FormState = {
  fecha: new Date().toISOString().slice(0, 10),
  categoria: "Gastos Menores",
  factura_compra: "",
  beneficiario: "",
  concepto: "",
  monto: "",
  descuento_cxc: "0",
  solicitud_transporte_id: SIN_VINCULO,
};

function SolicitudesPagoTransferenciaPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [borrar, setBorrar] = useState<Row | null>(null);
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["solicitudes-pago-transferencia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitudes_pago_transferencia")
        .select("*")
        .is("eliminado_en", null)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: transportes = [] } = useQuery({
    queryKey: ["spt-lite"],
    queryFn: async () =>
      (await supabase
        .from("solicitudes_pago_transporte")
        .select("id,numero_control,transportista_nombre")
        .order("created_at", { ascending: false })
        .limit(300)).data ?? [],
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.secuencia, r.categoria, r.beneficiario, r.concepto, r.factura_compra ?? ""]
        .join(" ").toLowerCase().includes(t));
  }, [rows, q]);

  const abrirNueva = () => { setForm(EMPTY_FORM); setEditing("new"); };
  const abrirEdicion = (r: Row) => {
    setForm({
      fecha: r.fecha,
      categoria: r.categoria,
      factura_compra: r.factura_compra ?? "",
      beneficiario: r.beneficiario,
      concepto: r.concepto,
      monto: String(r.monto ?? ""),
      descuento_cxc: String(r.descuento_cxc ?? 0),
      solicitud_transporte_id: r.solicitud_transporte_id ?? SIN_VINCULO,
    });
    setEditing(r);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.beneficiario.trim()) throw new Error("El beneficiario es obligatorio");
      if (!form.concepto.trim()) throw new Error("El concepto es obligatorio");
      const monto = Number(form.monto);
      if (!Number.isFinite(monto) || monto <= 0) throw new Error("El monto debe ser mayor que cero");

      const payload = {
        fecha: form.fecha,
        categoria: form.categoria,
        factura_compra: form.factura_compra.trim() || null,
        beneficiario: form.beneficiario.trim(),
        concepto: form.concepto.trim(),
        monto,
        descuento_cxc: Number(form.descuento_cxc || 0),
        solicitud_transporte_id:
          form.solicitud_transporte_id === SIN_VINCULO ? null : form.solicitud_transporte_id,
      };

      if (editing === "new") {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("solicitudes_pago_transferencia")
          .insert({ ...payload, creado_por: u.user?.id ?? null });
        if (error) throw error;
      } else if (editing) {
        const { error } = await supabase
          .from("solicitudes_pago_transferencia")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transferencia"] });
      setEditing(null);
      toast.success("Solicitud guardada");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const eliminar = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase
        .from("solicitudes_pago_transferencia")
        .update({ eliminado_en: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes-pago-transferencia"] });
      setBorrar(null);
      toast.success("Solicitud enviada a papelera");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  const netoForm = Number(form.monto || 0) - Number(form.descuento_cxc || 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Solicitudes de Pago por Transferencia</h1>
          <p className="text-sm text-muted-foreground">
            Captura interna de pagos a realizar por transferencia bancaria.
          </p>
        </div>
        <Button onClick={abrirNueva}>
          <Plus className="mr-1 h-4 w-4" /> Nueva Solicitud
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Listado</CardTitle>
          <CardDescription>{filtered.length} solicitud(es)</CardDescription>
          <div className="pt-2">
            <Input
              placeholder="Buscar por secuencia, beneficiario, concepto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Secuencia</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Categoría</th>
                <th className="py-2 pr-3">Beneficiario</th>
                <th className="py-2 pr-3">Concepto</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3 text-right">Descuento CxC</th>
                <th className="py-2 pr-3 text-right">Neto a Pagar</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Sin solicitudes</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 whitespace-nowrap">
                  <td className="py-1.5 pr-3 font-mono font-medium">{r.secuencia}</td>
                  <td className="py-1.5 pr-3">{fmtLocalDate(r.fecha)}</td>
                  <td className="py-1.5 pr-3">{r.categoria}</td>
                  <td className="py-1.5 pr-3 max-w-[180px] truncate">{r.beneficiario}</td>
                  <td className="py-1.5 pr-3 max-w-[240px] truncate">{r.concepto}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtMoney(Number(r.monto))}</td>
                  <td className="py-1.5 pr-3 text-right text-destructive">
                    {Number(r.descuento_cxc || 0) > 0 ? `-${fmtMoney(Number(r.descuento_cxc))}` : "—"}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-right font-semibold", neto(r) < 0 && "text-destructive")}>
                    {fmtMoney(neto(r))}
                  </td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicion(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Comprobante" asChild>
                        <a href={`/imprimir/solicitud-transferencia/${r.id}`} target="_blank" rel="noreferrer">
                          <Printer className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        size="icon" variant="ghost" title="Eliminar"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setBorrar(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva Solicitud" : "Editar Solicitud"}</DialogTitle>
            <DialogDescription>Pago a realizar por transferencia bancaria.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Factura de Compra</Label>
                <Input
                  value={form.factura_compra}
                  placeholder="Opcional"
                  onChange={(e) => setForm({ ...form, factura_compra: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Beneficiario</Label>
                <Input value={form.beneficiario} onChange={(e) => setForm({ ...form, beneficiario: e.target.value })} />
              </div>
              <div>
                <Label>Vincular a Solicitud de Transporte</Label>
                <Select
                  value={form.solicitud_transporte_id}
                  onValueChange={(v) => setForm({ ...form, solicitud_transporte_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin vínculo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VINCULO}>Sin vínculo</SelectItem>
                    {transportes.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.numero_control} — {t.transportista_nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Concepto</Label>
              <Textarea rows={2} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Monto (RD$)</Label>
                <Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </div>
              <div>
                <Label>Descuento por CxC (RD$)</Label>
                <Input type="number" step="0.01" value={form.descuento_cxc} onChange={(e) => setForm({ ...form, descuento_cxc: e.target.value })} />
              </div>
              <div>
                <Label>Neto a Pagar</Label>
                <div className={cn(
                  "mt-1 rounded-md border px-3 py-2 text-sm font-semibold",
                  netoForm < 0 ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}>
                  {fmtMoney(netoForm)}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar a papelera?</AlertDialogTitle>
            <AlertDialogDescription>
              La solicitud {borrar?.secuencia} dejará de aparecer en el listado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => borrar && eliminar.mutate(borrar)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
