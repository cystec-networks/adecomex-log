import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/academia/inscripciones")({
  component: Inscripciones,
});

const ESTADOS = ["inscrito", "en_curso", "completado", "retirado", "cancelado"] as const;

function Inscripciones() {
  const qc = useQueryClient();
  const [filterPrograma, setFilterPrograma] = useState<string>("todos");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState<any>(null);
  const [pagoMonto, setPagoMonto] = useState("0");

  const [form, setForm] = useState<any>({
    programa_id: "", estudiante_id: "", estado: "inscrito", monto_total: "", monto_pagado: "0", notas: "",
  });
  const [nuevoEst, setNuevoEst] = useState(false);
  const [estForm, setEstForm] = useState<any>({ nombre: "", cedula_pasaporte: "", email: "", telefono: "", empresa: "" });

  const { data: inscripciones } = useQuery({
    queryKey: ["academia-inscripciones"],
    queryFn: async () =>
      ((await (supabase as any).from("inscripciones").select("*").order("created_at", { ascending: false })).data ?? []) as any[],
  });
  const { data: programas } = useQuery({
    queryKey: ["academia-programas"],
    queryFn: async () =>
      ((await (supabase as any).from("programas_academia").select("id,nombre,precio,moneda,tipo,estado").order("nombre")).data ?? []) as any[],
  });
  const { data: estudiantes } = useQuery({
    queryKey: ["academia-estudiantes"],
    queryFn: async () =>
      ((await (supabase as any).from("estudiantes").select("id,nombre,email,cedula_pasaporte").order("nombre")).data ?? []) as any[],
  });

  const prgMap = new Map((programas ?? []).map((p: any) => [p.id, p]));
  const estMap = new Map((estudiantes ?? []).map((s: any) => [s.id, s]));

  const resetForm = () => {
    setForm({ programa_id: "", estudiante_id: "", estado: "inscrito", monto_total: "", monto_pagado: "0", notas: "" });
    setNuevoEst(false);
    setEstForm({ nombre: "", cedula_pasaporte: "", email: "", telefono: "", empresa: "" });
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      let estudianteId = form.estudiante_id;
      if (nuevoEst) {
        if (!estForm.nombre) throw new Error("El nombre del estudiante es obligatorio");
        const { data, error } = await (supabase as any).from("estudiantes").insert({ ...estForm, created_by: u.user?.id }).select("id").single();
        if (error) throw error;
        estudianteId = data.id;
      }
      if (!estudianteId) throw new Error("Selecciona un estudiante");
      if (!form.programa_id) throw new Error("Selecciona un programa");

      const payload: any = {
        programa_id: form.programa_id,
        estudiante_id: estudianteId,
        estado: form.estado,
        monto_total: form.monto_total ? Number(form.monto_total) : 0,
        monto_pagado: Number(form.monto_pagado || 0),
        notas: form.notas || null,
        created_by: u.user?.id,
      };
      const { error } = await (supabase as any).from("inscripciones").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inscripción creada");
      qc.invalidateQueries({ queryKey: ["academia-inscripciones"] });
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      qc.invalidateQueries({ queryKey: ["academia-inscripciones-count"] });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const registrarPago = useMutation({
    mutationFn: async ({ id, monto }: { id: string; monto: number }) => {
      const insc = (inscripciones ?? []).find((i: any) => i.id === id);
      if (!insc) throw new Error("Inscripción no encontrada");
      const nuevoPagado = Number(insc.monto_pagado || 0) + monto;
      const { error } = await (supabase as any).from("inscripciones").update({ monto_pagado: nuevoPagado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      qc.invalidateQueries({ queryKey: ["academia-inscripciones"] });
      setPagoOpen(null); setPagoMonto("0");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (inscripciones ?? []).filter((i: any) => {
    if (filterPrograma !== "todos" && i.programa_id !== filterPrograma) return false;
    if (filterEstado !== "todos" && i.estado !== filterEstado) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Inscripciones</h1>
          <p className="text-sm text-muted-foreground">Registro de inscripciones a programas de la Academia.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nueva inscripción</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nueva inscripción</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <div className="grid gap-1.5">
                <Label>Programa *</Label>
                <Select value={form.programa_id} onValueChange={(v) => setForm({ ...form, programa_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un programa" /></SelectTrigger>
                  <SelectContent>
                    {(programas ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.tipo} ({Number(p.precio).toFixed(2)} {p.moneda})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!nuevoEst} onChange={() => setNuevoEst(false)} /> Estudiante existente
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={nuevoEst} onChange={() => setNuevoEst(true)} /> Crear nuevo
                </label>
              </div>

              {!nuevoEst ? (
                <div className="grid gap-1.5">
                  <Label>Estudiante *</Label>
                  <Select value={form.estudiante_id} onValueChange={(v) => setForm({ ...form, estudiante_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona un estudiante" /></SelectTrigger>
                    <SelectContent>
                      {(estudiantes ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}{s.email ? ` — ${s.email}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-2 p-3 border rounded-md bg-muted/30">
                  <div className="grid gap-1.5"><Label>Nombre *</Label><Input required value={estForm.nombre} onChange={(e) => setEstForm({ ...estForm, nombre: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5"><Label>Cédula/Pasaporte</Label><Input value={estForm.cedula_pasaporte} onChange={(e) => setEstForm({ ...estForm, cedula_pasaporte: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>Empresa</Label><Input value={estForm.empresa} onChange={(e) => setEstForm({ ...estForm, empresa: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={estForm.email} onChange={(e) => setEstForm({ ...estForm, email: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={estForm.telefono} onChange={(e) => setEstForm({ ...estForm, telefono: e.target.value })} /></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label>Monto total</Label><Input type="number" step="0.01" placeholder="auto" value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Monto pagado</Label><Input type="number" step="0.01" value={form.monto_pagado} onChange={(e) => setForm({ ...form, monto_pagado: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Si dejas el monto total en blanco, se tomará automáticamente del precio del programa.</p>

              <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Guardar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs">Programa</Label>
          <Select value={filterPrograma} onValueChange={setFilterPrograma}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(programas ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Estudiante</th>
                <th className="text-left p-3">Programa</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Pagado</th>
                <th className="text-right p-3">Saldo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i: any) => {
                const p: any = prgMap.get(i.programa_id);
                const s: any = estMap.get(i.estudiante_id);
                const saldo = Number(i.monto_total || 0) - Number(i.monto_pagado || 0);
                return (
                  <tr key={i.id} className="border-t">
                    <td className="p-3 tabular-nums">{i.fecha_inscripcion}</td>
                    <td className="p-3 font-medium">{s?.nombre ?? "—"}</td>
                    <td className="p-3">{p?.nombre ?? "—"}</td>
                    <td className="p-3"><Badge variant="secondary">{i.estado}</Badge></td>
                    <td className="p-3 text-right tabular-nums">{Number(i.monto_total).toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">{Number(i.monto_pagado).toFixed(2)}</td>
                    <td className={`p-3 text-right tabular-nums ${saldo > 0 ? "text-destructive font-semibold" : ""}`}>{saldo.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setPagoOpen(i); setPagoMonto("0"); }}>
                        <DollarSign className="h-4 w-4 mr-1" />Pago
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin inscripciones.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!pagoOpen} onOpenChange={(o) => { if (!o) setPagoOpen(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {pagoOpen && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); registrarPago.mutate({ id: pagoOpen.id, monto: Number(pagoMonto) }); }}>
              <div className="text-sm text-muted-foreground">
                Saldo actual: <span className="font-semibold tabular-nums">{(Number(pagoOpen.monto_total || 0) - Number(pagoOpen.monto_pagado || 0)).toFixed(2)}</span>
              </div>
              <div className="grid gap-1.5"><Label>Monto del pago *</Label><Input required type="number" step="0.01" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} /></div>
              <DialogFooter><Button type="submit" disabled={registrarPago.isPending}>Registrar</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
