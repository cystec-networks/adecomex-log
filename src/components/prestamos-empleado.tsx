import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Ban, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";

export type Prestamo = {
  id: string;
  empleado_id: string;
  monto_prestado: number;
  monto_pagado: number;
  moneda: string;
  fecha_prestamo: string;
  motivo: string | null;
  estado: "activo" | "pagado" | "cancelado";
  notas: string | null;
};

export const ESTADO_PRESTAMO_LABEL: Record<string, string> = {
  activo: "Activo",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

export function EstadoPrestamoBadge({ estado }: { estado: string }) {
  const cls =
    estado === "activo"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : estado === "pagado"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cls}>{ESTADO_PRESTAMO_LABEL[estado] ?? estado}</Badge>;
}

export function money(n: number, moneda = "DOP") {
  return `${moneda} ${Number(n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ResumenPrestamos({ prestamos }: { prestamos: Prestamo[] }) {
  const activos = prestamos.filter((p) => p.estado === "activo");
  const prestado = activos.reduce((s, p) => s + Number(p.monto_prestado ?? 0), 0);
  const pagado = activos.reduce((s, p) => s + Number(p.monto_pagado ?? 0), 0);
  const saldo = prestado - pagado;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total prestado (activos)</div><div className="text-2xl font-bold">{money(prestado)}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total pagado</div><div className="text-2xl font-bold text-emerald-600">{money(pagado)}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Saldo pendiente</div><div className={`text-2xl font-bold ${saldo > 0 ? "text-amber-600" : ""}`}>{money(saldo)}</div></CardContent></Card>
    </div>
  );
}

export function PrestamosEmpleado({ empleadoId }: { empleadoId: string }) {
  const qc = useQueryClient();
  const [openNuevo, setOpenNuevo] = useState(false);
  const [form, setForm] = useState<any>({
    monto_prestado: "", fecha_prestamo: new Date().toISOString().slice(0, 10),
    moneda: "DOP", motivo: "", notas: "",
  });
  const [abonoDe, setAbonoDe] = useState<Prestamo | null>(null);
  const [abono, setAbono] = useState("");
  const [cancelarDe, setCancelarDe] = useState<Prestamo | null>(null);

  const { data: prestamos } = useQuery({
    queryKey: ["rrhh-prestamos", empleadoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("empleado_prestamos")
        .select("*")
        .eq("empleado_id", empleadoId)
        .is("deleted_at", null)
        .order("fecha_prestamo", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Prestamo[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rrhh-prestamos", empleadoId] });
    qc.invalidateQueries({ queryKey: ["rrhh-prestamos-all"] });
  };

  const crear = useMutation({
    mutationFn: async () => {
      const monto = Number(form.monto_prestado);
      if (!monto || monto <= 0) throw new Error("Indica un monto válido");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("empleado_prestamos").insert({
        empleado_id: empleadoId,
        monto_prestado: monto,
        fecha_prestamo: form.fecha_prestamo || new Date().toISOString().slice(0, 10),
        moneda: form.moneda || "DOP",
        motivo: form.motivo || null,
        notas: form.notas || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Préstamo registrado");
      setOpenNuevo(false);
      setForm({ monto_prestado: "", fecha_prestamo: new Date().toISOString().slice(0, 10), moneda: "DOP", motivo: "", notas: "" });
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
        .from("empleado_prestamos")
        .update({ monto_pagado: nuevo })
        .eq("id", abonoDe!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abono registrado");
      setAbonoDe(null); setAbono("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("empleado_prestamos")
        .update({ estado: "cancelado" })
        .eq("id", cancelarDe!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Préstamo cancelado");
      setCancelarDe(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lista = prestamos ?? [];

  return (
    <div className="space-y-4">
      <ResumenPrestamos prestamos={lista} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Préstamos</CardTitle>
          <Button size="sm" onClick={() => setOpenNuevo(true)}>
            <Plus className="h-4 w-4 mr-1" />Nuevo préstamo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-right p-2">Prestado</th>
                <th className="text-right p-2">Pagado</th>
                <th className="text-right p-2">Saldo</th>
                <th className="text-left p-2">Motivo</th>
                <th className="text-left p-2">Estado</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const saldo = Number(p.monto_prestado ?? 0) - Number(p.monto_pagado ?? 0);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{fmtLocalDate(p.fecha_prestamo)}</td>
                    <td className="p-2 text-right">{money(p.monto_prestado, p.moneda)}</td>
                    <td className="p-2 text-right">{money(p.monto_pagado, p.moneda)}</td>
                    <td className="p-2 text-right font-medium">{money(saldo, p.moneda)}</td>
                    <td className="p-2">{p.motivo ?? "—"}</td>
                    <td className="p-2"><EstadoPrestamoBadge estado={p.estado} /></td>
                    <td className="p-2 text-right">
                      {p.estado === "activo" && (
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setAbonoDe(p); setAbono(""); }}>
                            <DollarSign className="h-3.5 w-3.5 mr-1" />Registrar pago
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setCancelarDe(p)}>
                            <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin préstamos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={openNuevo} onOpenChange={setOpenNuevo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo préstamo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Monto prestado *</Label>
              <Input type="number" step="0.01" value={form.monto_prestado}
                onChange={(e) => setForm({ ...form, monto_prestado: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.fecha_prestamo}
                onChange={(e) => setForm({ ...form, fecha_prestamo: e.target.value })} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Motivo</Label>
              <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
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
                Saldo actual: <span className="font-medium text-foreground">
                  {money(Number(abonoDe.monto_prestado) - Number(abonoDe.monto_pagado), abonoDe.moneda)}
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
            <AlertDialogAction onClick={() => cancelar.mutate()}>Cancelar préstamo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
