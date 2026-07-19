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
import { Plus, DollarSign, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [pagoOpen, setPagoOpen] = useState<any>(null); // { cuota, inscripcion }
  const [pagoMonto, setPagoMonto] = useState("0");
  const [expandido, setExpandido] = useState<string | null>(null);

  const [form, setForm] = useState<any>({
    programa_id: "", estudiante_id: "", estado: "inscrito", monto_total: "", notas: "",
    referido_por_estudiante_id: "",
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
      ((await (supabase as any).from("programas_academia").select("id,nombre,precio,moneda,tipo,estado,descuento_referido_pct,plan_pago").order("nombre")).data ?? []) as any[],
  });
  const { data: estudiantes } = useQuery({
    queryKey: ["academia-estudiantes"],
    queryFn: async () =>
      ((await (supabase as any).from("estudiantes").select("id,nombre,email,cedula_pasaporte").order("nombre")).data ?? []) as any[],
  });
  const { data: cuotas } = useQuery({
    queryKey: ["academia-cuotas"],
    queryFn: async () =>
      ((await (supabase as any).from("inscripcion_cuotas").select("*").order("numero_cuota")).data ?? []) as any[],
  });

  const prgMap = new Map((programas ?? []).map((p: any) => [p.id, p]));
  const estMap = new Map((estudiantes ?? []).map((s: any) => [s.id, s]));
  const cuotasPorInsc = useMemo(() => {
    const m = new Map<string, any[]>();
    (cuotas ?? []).forEach((c: any) => {
      const arr = m.get(c.inscripcion_id) ?? [];
      arr.push(c);
      m.set(c.inscripcion_id, arr);
    });
    return m;
  }, [cuotas]);

  const resetForm = () => {
    setForm({ programa_id: "", estudiante_id: "", estado: "inscrito", monto_total: "", notas: "", referido_por_estudiante_id: "" });
    setNuevoEst(false);
    setEstForm({ nombre: "", cedula_pasaporte: "", email: "", telefono: "", empresa: "" });
  };

  // Cálculo automático de monto con descuento por referido
  const programaSel: any = form.programa_id ? prgMap.get(form.programa_id) : null;
  const precioBase = programaSel ? Number(programaSel.precio || 0) : 0;
  const descPct = programaSel ? Number(programaSel.descuento_referido_pct || 0) : 0;
  const referidoActivo = !!form.referido_por_estudiante_id && descPct > 0;
  const descuentoCalc = referidoActivo ? Math.round(precioBase * descPct) / 100 : 0;
  const montoConDesc = Math.max(0, precioBase - descuentoCalc);
  const montoFinal = form.monto_total !== "" ? Number(form.monto_total) : montoConDesc;

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
      if (form.referido_por_estudiante_id && form.referido_por_estudiante_id === estudianteId) {
        throw new Error("El referido no puede ser el mismo estudiante");
      }

      const payload: any = {
        programa_id: form.programa_id,
        estudiante_id: estudianteId,
        estado: form.estado,
        monto_total: montoFinal,
        notas: form.notas || null,
        referido_por_estudiante_id: form.referido_por_estudiante_id || null,
        descuento_aplicado: referidoActivo ? descuentoCalc : 0,
        created_by: u.user?.id,
      };
      const { error } = await (supabase as any).from("inscripciones").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inscripción creada");
      qc.invalidateQueries({ queryKey: ["academia-inscripciones"] });
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      qc.invalidateQueries({ queryKey: ["academia-cuotas"] });
      qc.invalidateQueries({ queryKey: ["academia-inscripciones-count"] });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const registrarPago = useMutation({
    mutationFn: async ({ cuotaId, monto }: { cuotaId: string; monto: number }) => {
      const c = (cuotas ?? []).find((x: any) => x.id === cuotaId);
      if (!c) throw new Error("Cuota no encontrada");
      const nuevoPagado = Number(c.monto_pagado || 0) + monto;
      const { error } = await (supabase as any).from("inscripcion_cuotas").update({ monto_pagado: nuevoPagado }).eq("id", cuotaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      qc.invalidateQueries({ queryKey: ["academia-inscripciones"] });
      qc.invalidateQueries({ queryKey: ["academia-cuotas"] });
      setPagoOpen(null); setPagoMonto("0");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (inscripciones ?? []).filter((i: any) => {
    if (filterPrograma !== "todos" && i.programa_id !== filterPrograma) return false;
    if (filterEstado !== "todos" && i.estado !== filterEstado) return false;
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cuotaBadge = (c: any) => {
    if (c.estado === "pagada") return <Badge className="bg-emerald-600 hover:bg-emerald-700">pagada</Badge>;
    if (c.estado === "disputada") return <Badge variant="destructive">disputada</Badge>;
    if (c.fecha_vencimiento) {
      const v = new Date(c.fecha_vencimiento);
      const dias = Math.floor((v.getTime() - today.getTime()) / 86400000);
      if (dias < 0) return <Badge variant="destructive">vencida ({-dias}d)</Badge>;
      if (dias <= 7) return <Badge className="bg-amber-500 hover:bg-amber-600">vence en {dias}d</Badge>;
    }
    return <Badge variant="secondary">pendiente</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Inscripciones</h1>
          <p className="text-sm text-muted-foreground">Registro de inscripciones a programas de la Academia.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nueva inscripción</Button></DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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

              <div className="grid gap-1.5">
                <Label>Referido por (opcional)</Label>
                <Select value={form.referido_por_estudiante_id || "__none"} onValueChange={(v) => setForm({ ...form, referido_por_estudiante_id: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sin referido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin referido</SelectItem>
                    {(estudiantes ?? []).filter((s: any) => s.id !== form.estudiante_id).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {programaSel && descPct > 0 && (
                  <p className="text-xs text-muted-foreground">Este programa otorga {descPct}% de descuento por referido.</p>
                )}
              </div>

              {referidoActivo && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-md text-sm space-y-1">
                  <div className="flex justify-between"><span>Precio del programa</span><span className="tabular-nums">{precioBase.toFixed(2)}</span></div>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Descuento por referido ({descPct}%)</span><span className="tabular-nums">−{descuentoCalc.toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-emerald-200 dark:border-emerald-900 pt-1"><span>Total a cobrar</span><span className="tabular-nums">{montoConDesc.toFixed(2)}</span></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label>Monto total (opcional)</Label><Input type="number" step="0.01" placeholder={montoConDesc.toFixed(2)} value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Si dejas el monto en blanco, se usa el precio del programa {referidoActivo ? "menos el descuento por referido" : ""}. Las cuotas se generan automáticamente si el programa tiene plan de pago.</p>

              <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Confirmar y guardar"}</Button></DialogFooter>
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
                <th className="text-left p-3 w-8"></th>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Estudiante</th>
                <th className="text-left p-3">Programa</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Pagado</th>
                <th className="text-right p-3">Saldo</th>
                <th className="text-center p-3">Cuotas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i: any) => {
                const p: any = prgMap.get(i.programa_id);
                const s: any = estMap.get(i.estudiante_id);
                const saldo = Number(i.monto_total || 0) - Number(i.monto_pagado || 0);
                const cs = cuotasPorInsc.get(i.id) ?? [];
                const expanded = expandido === i.id;
                return (
                  <React.Fragment key={i.id}>
                    <tr className="border-t">
                      <td className="p-2">
                        {cs.length > 0 && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpandido(expanded ? null : i.id)}>
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        )}
                      </td>
                      <td className="p-3 tabular-nums">{i.fecha_inscripcion}</td>
                      <td className="p-3 font-medium">{s?.nombre ?? "—"}</td>
                      <td className="p-3">{p?.nombre ?? "—"}</td>
                      <td className="p-3"><Badge variant="secondary">{i.estado}</Badge></td>
                      <td className="p-3 text-right tabular-nums">{Number(i.monto_total).toFixed(2)}</td>
                      <td className="p-3 text-right tabular-nums">{Number(i.monto_pagado).toFixed(2)}</td>
                      <td className={`p-3 text-right tabular-nums ${saldo > 0 ? "text-destructive font-semibold" : ""}`}>{saldo.toFixed(2)}</td>
                      <td className="p-3 text-center text-xs text-muted-foreground">{cs.length > 0 ? `${cs.filter((c: any) => c.estado === "pagada").length}/${cs.length}` : "—"}</td>
                    </tr>
                    {expanded && cs.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={9} className="p-4">
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-muted-foreground uppercase">Cuotas</div>
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="text-left p-1">#</th>
                                  <th className="text-left p-1">Descripción</th>
                                  <th className="text-right p-1">Monto</th>
                                  <th className="text-right p-1">Pagado</th>
                                  <th className="text-left p-1">Vencimiento</th>
                                  <th className="text-left p-1">Estado</th>
                                  <th className="p-1"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {cs.map((c: any) => (
                                  <tr key={c.id} className="border-t">
                                    <td className="p-1 tabular-nums">{c.numero_cuota}</td>
                                    <td className="p-1">{c.descripcion ?? "—"}</td>
                                    <td className="p-1 text-right tabular-nums">{Number(c.monto).toFixed(2)}</td>
                                    <td className="p-1 text-right tabular-nums">{Number(c.monto_pagado).toFixed(2)}</td>
                                    <td className="p-1">
                                      <Input
                                        type="date"
                                        value={c.fecha_vencimiento ?? ""}
                                        onChange={async (e) => {
                                          const v = e.target.value || null;
                                          await (supabase as any).from("inscripcion_cuotas").update({ fecha_vencimiento: v }).eq("id", c.id);
                                          qc.invalidateQueries({ queryKey: ["academia-cuotas"] });
                                        }}
                                        className="h-7 text-xs w-36"
                                      />
                                    </td>
                                    <td className="p-1">{cuotaBadge(c)}</td>
                                    <td className="p-1 text-right">
                                      {c.estado !== "pagada" && (
                                        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setPagoOpen({ cuota: c }); setPagoMonto(String(Math.max(0, Number(c.monto) - Number(c.monto_pagado)).toFixed(2))); }}>
                                          <DollarSign className="h-3 w-3 mr-1" />Pago
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sin inscripciones.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!pagoOpen} onOpenChange={(o) => { if (!o) setPagoOpen(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago de cuota</DialogTitle></DialogHeader>
          {pagoOpen && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); registrarPago.mutate({ cuotaId: pagoOpen.cuota.id, monto: Number(pagoMonto) }); }}>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Cuota #{pagoOpen.cuota.numero_cuota}</span><span>{pagoOpen.cuota.descripcion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto de la cuota</span><span className="tabular-nums">{Number(pagoOpen.cuota.monto).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ya pagado</span><span className="tabular-nums">{Number(pagoOpen.cuota.monto_pagado).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Saldo</span><span className="tabular-nums">{(Number(pagoOpen.cuota.monto) - Number(pagoOpen.cuota.monto_pagado)).toFixed(2)}</span></div>
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
