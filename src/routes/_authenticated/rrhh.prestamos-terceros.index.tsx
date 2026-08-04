import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Ban, DollarSign, Trash2, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { EstadoPrestamoBadge, money } from "@/components/prestamos-empleado";

export const Route = createFileRoute("/_authenticated/rrhh/prestamos-terceros/")({
  component: PrestamosTerceros,
  head: () => ({
    meta: [
      { title: "Préstamos a terceros | ADECOMEX" },
      { name: "description", content: "Control de préstamos a socios, familiares y conocidos con interés mensual acumulado." },
      { property: "og:title", content: "Préstamos a terceros | ADECOMEX" },
      { property: "og:description", content: "Control de préstamos a socios, familiares y conocidos con interés mensual acumulado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type PrestamoTercero = {
  id: string;
  nombre_deudor: string;
  telefono: string | null;
  relacion: string | null;
  monto_prestado: number;
  tasa_interes_pct: number;
  monto_pagado: number;
  moneda: string;
  fecha_prestamo: string;
  estado: "activo" | "pagado" | "cancelado";
  notas: string | null;
  deleted_at: string | null;
};

const RELACIONES = ["Socio", "Familiar", "Amigo", "Otro"];

/** Réplica de public.calcular_interes_prestamo_tercero */
function interesAcumulado(p: PrestamoTercero): number {
  if (!p.fecha_prestamo) return 0;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [y, m, d] = p.fecha_prestamo.split("-").map(Number);
  const inicio = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  if (inicio > hoyUTC) return 0;
  const dias = Math.round((hoyUTC - inicio) / 86400000);
  const val = Number(p.monto_prestado ?? 0) * (Number(p.tasa_interes_pct ?? 0) / 100) * (dias / 30);
  return Math.round(val * 100) / 100;
}

const emptyForm = () => ({
  nombre_deudor: "",
  telefono: "",
  relacion: "Socio",
  monto_prestado: "",
  tasa_interes_pct: "",
  fecha_prestamo: new Date().toISOString().slice(0, 10),
  moneda: "DOP",
  notas: "",
});

function PrestamosTerceros() {
  const qc = useQueryClient();
  const [verPapelera, setVerPapelera] = useState(false);
  const [estado, setEstado] = useState("todos");
  const [openNuevo, setOpenNuevo] = useState(false);
  const [form, setForm] = useState<any>(emptyForm());
  const [abonoDe, setAbonoDe] = useState<PrestamoTercero | null>(null);
  const [abono, setAbono] = useState("");
  const [cancelarDe, setCancelarDe] = useState<PrestamoTercero | null>(null);
  const [eliminarDe, setEliminarDe] = useState<PrestamoTercero | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["prestamos-terceros", verPapelera],
    queryFn: async () => {
      let q = (supabase as any)
        .from("prestamos_terceros")
        .select("*")
        .order("fecha_prestamo", { ascending: false });
      q = verPapelera ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PrestamoTercero[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["prestamos-terceros"] });

  const crear = useMutation({
    mutationFn: async () => {
      if (!form.nombre_deudor.trim()) throw new Error("Indica el nombre del deudor");
      const monto = Number(form.monto_prestado);
      if (!monto || monto <= 0) throw new Error("Indica un monto válido");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("prestamos_terceros").insert({
        nombre_deudor: form.nombre_deudor.trim(),
        telefono: form.telefono || null,
        relacion: form.relacion || null,
        monto_prestado: monto,
        tasa_interes_pct: Number(form.tasa_interes_pct) || 0,
        fecha_prestamo: form.fecha_prestamo || new Date().toISOString().slice(0, 10),
        moneda: form.moneda || "DOP",
        notas: form.notas || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Préstamo registrado");
      setOpenNuevo(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pagar = useMutation({
    mutationFn: async () => {
      const val = Number(abono);
      if (!val || val <= 0) throw new Error("Indica un monto válido");
      const nuevo = Number(abonoDe!.monto_pagado ?? 0) + val;
      const { error } = await (supabase as any)
        .from("prestamos_terceros").update({ monto_pagado: nuevo }).eq("id", abonoDe!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abono registrado");
      setAbonoDe(null); setAbono("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, nuevo }: { id: string; nuevo: string }) => {
      const { error } = await (supabase as any)
        .from("prestamos_terceros").update({ estado: nuevo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Estado actualizado"); setCancelarDe(null); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("prestamos_terceros")
        .update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviado a la papelera"); setEliminarDe(null); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const restaurar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("prestamos_terceros")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Préstamo restaurado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const todos = data ?? [];
  const lista = estado === "todos" ? todos : todos.filter((p) => p.estado === estado);

  const activos = todos.filter((p) => p.estado === "activo");
  const totalPrestado = activos.reduce((s, p) => s + Number(p.monto_prestado ?? 0), 0);
  const totalInteres = activos.reduce((s, p) => s + interesAcumulado(p), 0);
  const totalPagado = activos.reduce((s, p) => s + Number(p.monto_pagado ?? 0), 0);
  const saldoTotal = totalPrestado + totalInteres - totalPagado;

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Préstamos a terceros</h1>
          <p className="text-sm text-muted-foreground">
            Socios, familiares y conocidos. El interés se calcula automáticamente por mes transcurrido.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerPapelera((v) => !v)}>
            <Trash2 className="h-4 w-4 mr-1" />{verPapelera ? "Ver activos" : "Ver papelera"}
          </Button>
          {!verPapelera && (
            <Button size="sm" onClick={() => setOpenNuevo(true)}>
              <Plus className="h-4 w-4 mr-1" />Nuevo préstamo
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total prestado (activos)</div><div className="text-2xl font-bold">{money(totalPrestado)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Interés acumulado</div><div className="text-2xl font-bold text-sky-600">{money(totalInteres)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Saldo pendiente</div><div className={`text-2xl font-bold ${saldoTotal > 0 ? "text-amber-600" : ""}`}>{money(saldoTotal)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{verPapelera ? "Papelera" : "Listado"}</CardTitle>
          <div className="grid gap-1.5 w-48">
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="pagado">Pagados</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Nombre</th>
                <th className="text-left p-2">Relación</th>
                <th className="text-left p-2">Teléfono</th>
                <th className="text-left p-2">Fecha</th>
                <th className="text-right p-2">Prestado</th>
                <th className="text-right p-2">Tasa (%)</th>
                <th className="text-right p-2">Interés</th>
                <th className="text-right p-2">Pagado</th>
                <th className="text-right p-2">Saldo</th>
                <th className="text-left p-2">Estado</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const interes = interesAcumulado(p);
                const saldo = Number(p.monto_prestado ?? 0) + interes - Number(p.monto_pagado ?? 0);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-medium">{p.nombre_deudor}</td>
                    <td className="p-2">{p.relacion ?? "—"}</td>
                    <td className="p-2">{p.telefono ?? "—"}</td>
                    <td className="p-2">{fmtLocalDate(p.fecha_prestamo)}</td>
                    <td className="p-2 text-right">{money(p.monto_prestado, p.moneda)}</td>
                    <td className="p-2 text-right">{Number(p.tasa_interes_pct ?? 0).toFixed(3)}</td>
                    <td className="p-2 text-right text-sky-600">{money(interes, p.moneda)}</td>
                    <td className="p-2 text-right">{money(p.monto_pagado, p.moneda)}</td>
                    <td className="p-2 text-right font-medium">{money(saldo, p.moneda)}</td>
                    <td className="p-2"><EstadoPrestamoBadge estado={p.estado} /></td>
                    <td className="p-2 text-right">
                      {verPapelera ? (
                        <Button variant="outline" size="sm" onClick={() => restaurar.mutate(p.id)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {p.estado === "activo" && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => { setAbonoDe(p); setAbono(""); }}>
                                <DollarSign className="h-3.5 w-3.5 mr-1" />Registrar pago
                              </Button>
                              <Button variant="outline" size="sm"
                                onClick={() => cambiarEstado.mutate({ id: p.id, nuevo: "pagado" })}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Marcar como pagado
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setCancelarDe(p)}>
                                <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEliminarDe(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && lista.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Sin préstamos.</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={openNuevo} onOpenChange={setOpenNuevo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo préstamo a tercero</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Nombre del deudor *</Label>
              <Input value={form.nombre_deudor} onChange={(e) => setForm({ ...form, nombre_deudor: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Relación</Label>
              <Select value={form.relacion} onValueChange={(v) => setForm({ ...form, relacion: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELACIONES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Monto prestado *</Label>
              <Input type="number" step="0.01" value={form.monto_prestado}
                onChange={(e) => setForm({ ...form, monto_prestado: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Tasa de interés mensual (%)</Label>
              <Input type="number" step="0.001" value={form.tasa_interes_pct}
                onChange={(e) => setForm({ ...form, tasa_interes_pct: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.fecha_prestamo}
                onChange={(e) => setForm({ ...form, fecha_prestamo: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Notas</Label>
              <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
            <Button onClick={() => crear.mutate()} disabled={crear.isPending}>
              {crear.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!abonoDe} onOpenChange={(o) => !o && setAbonoDe(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {abonoDe && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Saldo actual (capital + interés):{" "}
                <span className="font-medium text-foreground">
                  {money(Number(abonoDe.monto_prestado) + interesAcumulado(abonoDe) - Number(abonoDe.monto_pagado), abonoDe.moneda)}
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Monto del abono</Label>
                <Input type="number" step="0.01" value={abono} onChange={(e) => setAbono(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbonoDe(null)}>Cancelar</Button>
            <Button onClick={() => pagar.mutate()} disabled={pagar.isPending}>
              {pagar.isPending ? "Guardando…" : "Registrar abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelarDe} onOpenChange={(o) => !o && setCancelarDe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este préstamo?</AlertDialogTitle>
            <AlertDialogDescription>
              El préstamo quedará marcado como cancelado y dejará de contar en el saldo pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelarDe && cambiarEstado.mutate({ id: cancelarDe.id, nuevo: "cancelado" })}>
              Cancelar préstamo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!eliminarDe} onOpenChange={(o) => !o && setEliminarDe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar a la papelera?</AlertDialogTitle>
            <AlertDialogDescription>
              Podrás restaurarlo luego desde la papelera de reciclaje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => eliminarDe && eliminar.mutate(eliminarDe.id)}>Enviar a papelera</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
