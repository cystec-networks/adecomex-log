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
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { money, type Prestamo } from "@/components/prestamos-empleado";

function periodoSugerido() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  if (hoy.getDate() <= 15) return { inicio: iso(1), fin: iso(15) };
  const ultimo = new Date(y, m + 1, 0).getDate();
  return { inicio: iso(16), fin: iso(ultimo) };
}

const EMPTY = () => {
  const p = periodoSugerido();
  return {
    periodo_inicio: p.inicio,
    periodo_fin: p.fin,
    salario_quincena: "",
    descuento_prestamo: "",
    afp_monto: "",
    ars_monto: "",
    isr_monto: "",
    otros_descuentos: "",
    otros_descuentos_concepto: "",
    notas: "",
  };
};

export function RecibosPagoEmpleado({
  empleadoId,
  salarioBase,
  afpMontoFijo = null,
  arsMontoFijo = null,
}: {
  empleadoId: string;
  salarioBase: number | null;
  afpMontoFijo?: number | null;
  arsMontoFijo?: number | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY());

  const { data: recibos } = useQuery({
    queryKey: ["rrhh-recibos", empleadoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("recibos_pago")
        .select("*")
        .eq("empleado_id", empleadoId)
        .is("deleted_at", null)
        .order("periodo_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

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

  const prestamoActivo = (prestamos ?? []).find((p) => p.estado === "activo") ?? null;
  const saldoPrestamo = prestamoActivo
    ? Number(prestamoActivo.monto_prestado ?? 0) - Number(prestamoActivo.monto_pagado ?? 0)
    : 0;

  const n = (v: any) => Number(v || 0);
  const neto =
    n(form.salario_quincena) -
    n(form.descuento_prestamo) -
    n(form.afp_monto) -
    n(form.ars_monto) -
    n(form.isr_monto) -
    n(form.otros_descuentos);

  const abrir = () => {
    const base = EMPTY();
    setForm({
      ...base,
      salario_quincena: salarioBase ? String(Number(salarioBase) / 2) : "",
    });
    setOpen(true);
  };

  const crear = useMutation({
    mutationFn: async () => {
      if (!form.periodo_inicio || !form.periodo_fin) throw new Error("Indica el período");
      const desc = n(form.descuento_prestamo);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("recibos_pago").insert({
        empleado_id: empleadoId,
        periodo_inicio: form.periodo_inicio,
        periodo_fin: form.periodo_fin,
        salario_quincena: n(form.salario_quincena),
        prestamo_id: desc > 0 && prestamoActivo ? prestamoActivo.id : null,
        descuento_prestamo: desc,
        afp_monto: n(form.afp_monto),
        ars_monto: n(form.ars_monto),
        isr_monto: n(form.isr_monto),
        otros_descuentos: n(form.otros_descuentos),
        otros_descuentos_concepto: form.otros_descuentos_concepto || null,
        neto_pagado: neto,
        notas: form.notas || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;

      if (desc > 0 && prestamoActivo) {
        const nuevo = Number(prestamoActivo.monto_pagado ?? 0) + desc;
        const { error: e2 } = await (supabase as any)
          .from("empleado_prestamos")
          .update({ monto_pagado: nuevo })
          .eq("id", prestamoActivo.id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Recibo generado");
      setOpen(false);
      setForm(EMPTY());
      qc.invalidateQueries({ queryKey: ["rrhh-recibos", empleadoId] });
      qc.invalidateQueries({ queryKey: ["rrhh-prestamos", empleadoId] });
      qc.invalidateQueries({ queryKey: ["rrhh-prestamos-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lista = recibos ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recibos de pago</CardTitle>
          <Button size="sm" onClick={abrir}>
            <Plus className="h-4 w-4 mr-1" />Nuevo recibo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Período</th>
                <th className="text-right p-2">Neto pagado</th>
                <th className="text-left p-2">Generado</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{fmtLocalDate(r.periodo_inicio)} — {fmtLocalDate(r.periodo_fin)}</td>
                  <td className="p-2 text-right font-medium">{money(r.neto_pagado)}</td>
                  <td className="p-2">{fmtLocalDate(r.created_at)}</td>
                  <td className="p-2 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/imprimir/recibo-pago/${r.id}`} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-3.5 w-3.5 mr-1" />Ver/Descargar PDF
                      </a>
                    </Button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin recibos generados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuevo recibo de pago</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Período — desde</Label>
              <Input type="date" value={form.periodo_inicio} onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Período — hasta</Label>
              <Input type="date" value={form.periodo_fin} onChange={(e) => setForm({ ...form, periodo_fin: e.target.value })} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Salario quincena</Label>
              <Input type="number" step="0.01" value={form.salario_quincena} onChange={(e) => setForm({ ...form, salario_quincena: e.target.value })} />
            </div>

            {prestamoActivo && (
              <div className="col-span-2 rounded-md border bg-muted/40 p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Préstamo activo — saldo pendiente:{" "}
                  <span className="font-medium text-foreground">{money(saldoPrestamo, prestamoActivo.moneda)}</span>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Descuento de préstamo esta quincena</Label>
                  <Input type="number" step="0.01" value={form.descuento_prestamo}
                    onChange={(e) => setForm({ ...form, descuento_prestamo: e.target.value })} />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">AFP</Label>
              <Input type="number" step="0.01" value={form.afp_monto} onChange={(e) => setForm({ ...form, afp_monto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">ARS</Label>
              <Input type="number" step="0.01" value={form.ars_monto} onChange={(e) => setForm({ ...form, ars_monto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">ISR</Label>
              <Input type="number" step="0.01" value={form.isr_monto} onChange={(e) => setForm({ ...form, isr_monto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Otros descuentos</Label>
              <Input type="number" step="0.01" value={form.otros_descuentos} onChange={(e) => setForm({ ...form, otros_descuentos: e.target.value })} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Concepto de otros descuentos</Label>
              <Input value={form.otros_descuentos_concepto} onChange={(e) => setForm({ ...form, otros_descuentos_concepto: e.target.value })} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">Notas</Label>
              <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>

            <div className="col-span-2 flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">Neto a pagar</span>
              <span className="text-lg font-bold">{money(neto)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => crear.mutate()} disabled={crear.isPending}>
              {crear.isPending ? "Guardando…" : "Guardar recibo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
