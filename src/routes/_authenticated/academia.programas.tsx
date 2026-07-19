import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/academia/programas")({
  component: Programas,
});

const TIPOS = ["diplomado", "curso", "taller"] as const;
const ESTADOS = ["planificado", "activo", "en_curso", "finalizado", "cancelado"] as const;
const MODALIDADES = ["virtual", "presencial", "mixta"] as const;

const empty = {
  tipo: "curso",
  nombre: "",
  descripcion: "",
  modalidad: "virtual",
  duracion_horas: "",
  precio: "0",
  moneda: "DOP",
  cupo_maximo: "",
  estado: "planificado",
  fecha_inicio: "",
  fecha_fin: "",
  dirigido_a: "",
  certificacion: "",
  cantidad_encuentros: "",
  horas_por_encuentro: "",
  metodologia: [] as string[],
  temario: [] as { numero: number; titulo: string; subtemas: string[] }[],
  plan_pago: [] as { descripcion: string; porcentaje: number }[],
  descuento_referido_pct: "0",
  enlace_classroom: "",
} as any;

function Programas() {
  const qc = useQueryClient();
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);
  const [detalle, setDetalle] = useState<any>(null);

  const { data: programas } = useQuery({
    queryKey: ["academia-programas"],
    queryFn: async () =>
      ((await (supabase as any).from("programas_academia").select("*").order("created_at", { ascending: false })).data ?? []) as any[],
  });

  const { data: inscripcionesAll } = useQuery({
    queryKey: ["academia-inscripciones-count"],
    queryFn: async () =>
      ((await (supabase as any).from("inscripciones").select("programa_id,estado")).data ?? []) as any[],
  });

  const activasPorPrograma = new Map<string, number>();
  (inscripcionesAll ?? []).forEach((i) => {
    if (["inscrito", "en_curso", "completado"].includes(i.estado)) {
      activasPorPrograma.set(i.programa_id, (activasPorPrograma.get(i.programa_id) ?? 0) + 1);
    }
  });

  const totalPct = (form.plan_pago as any[]).reduce((s, r) => s + (Number(r.porcentaje) || 0), 0);

  const save = useMutation({
    mutationFn: async (payload: any) => {
      const clean = {
        ...payload,
        duracion_horas: payload.duracion_horas ? Number(payload.duracion_horas) : null,
        cupo_maximo: payload.cupo_maximo ? Number(payload.cupo_maximo) : null,
        precio: Number(payload.precio || 0),
        fecha_inicio: payload.fecha_inicio || null,
        fecha_fin: payload.fecha_fin || null,
        cantidad_encuentros: payload.cantidad_encuentros ? Number(payload.cantidad_encuentros) : null,
        horas_por_encuentro: payload.horas_por_encuentro ? Number(payload.horas_por_encuentro) : null,
        descuento_referido_pct: Number(payload.descuento_referido_pct || 0),
        enlace_classroom: payload.enlace_classroom?.trim() || null,
        metodologia: payload.metodologia ?? [],
        temario: (payload.temario ?? []).map((m: any, i: number) => ({
          numero: m.numero ?? i + 1,
          titulo: m.titulo ?? "",
          subtemas: (m.subtemas ?? []).filter((s: string) => s.trim() !== ""),
        })),
        plan_pago: (payload.plan_pago ?? []).map((c: any) => ({
          descripcion: c.descripcion ?? "",
          porcentaje: Number(c.porcentaje) || 0,
        })),
      };
      if (editing) {
        const { error } = await (supabase as any).from("programas_academia").update(clean).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("programas_academia").insert({ ...clean, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Programa actualizado" : "Programa creado");
      qc.invalidateQueries({ queryKey: ["academia-programas"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (programas ?? []).filter((p: any) => {
    if (filterTipo !== "todos" && p.tipo !== filterTipo) return false;
    if (filterEstado !== "todos" && p.estado !== filterEstado) return false;
    return true;
  });

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      tipo: p.tipo, nombre: p.nombre, descripcion: p.descripcion ?? "",
      modalidad: p.modalidad ?? "virtual",
      duracion_horas: p.duracion_horas ?? "", precio: p.precio ?? "0",
      moneda: p.moneda ?? "DOP", cupo_maximo: p.cupo_maximo ?? "",
      estado: p.estado, fecha_inicio: p.fecha_inicio ?? "", fecha_fin: p.fecha_fin ?? "",
      dirigido_a: p.dirigido_a ?? "",
      certificacion: p.certificacion ?? "",
      cantidad_encuentros: p.cantidad_encuentros ?? "",
      horas_por_encuentro: p.horas_por_encuentro ?? "",
      metodologia: Array.isArray(p.metodologia) ? p.metodologia : [],
      temario: Array.isArray(p.temario) ? p.temario : [],
      plan_pago: Array.isArray(p.plan_pago) ? p.plan_pago : [],
      descuento_referido_pct: p.descuento_referido_pct ?? "0",
      enlace_classroom: p.enlace_classroom ?? "",
    });
    setOpen(true);
  };

  // ---- helpers metodología ----
  const setMet = (arr: string[]) => setForm({ ...form, metodologia: arr });
  const addMet = () => setMet([...(form.metodologia as string[]), ""]);
  const updMet = (i: number, v: string) => { const a = [...form.metodologia]; a[i] = v; setMet(a); };
  const rmMet = (i: number) => setMet(form.metodologia.filter((_: any, x: number) => x !== i));

  // ---- helpers temario ----
  const setTem = (arr: any[]) => setForm({ ...form, temario: arr });
  const addModulo = () => setTem([...form.temario, { numero: form.temario.length + 1, titulo: "", subtemas: [""] }]);
  const rmModulo = (i: number) => setTem(form.temario.filter((_: any, x: number) => x !== i).map((m: any, x: number) => ({ ...m, numero: x + 1 })));
  const updModulo = (i: number, patch: any) => { const a = [...form.temario]; a[i] = { ...a[i], ...patch }; setTem(a); };
  const addSub = (i: number) => { const a = [...form.temario]; a[i] = { ...a[i], subtemas: [...(a[i].subtemas ?? []), ""] }; setTem(a); };
  const updSub = (i: number, j: number, v: string) => { const a = [...form.temario]; const subs = [...a[i].subtemas]; subs[j] = v; a[i] = { ...a[i], subtemas: subs }; setTem(a); };
  const rmSub = (i: number, j: number) => { const a = [...form.temario]; a[i] = { ...a[i], subtemas: a[i].subtemas.filter((_: any, x: number) => x !== j) }; setTem(a); };

  // ---- helpers plan de pago ----
  const setPlan = (arr: any[]) => setForm({ ...form, plan_pago: arr });
  const addCuota = () => setPlan([...form.plan_pago, { descripcion: "", porcentaje: 0 }]);
  const updCuota = (i: number, patch: any) => { const a = [...form.plan_pago]; a[i] = { ...a[i], ...patch }; setPlan(a); };
  const rmCuota = (i: number) => setPlan(form.plan_pago.filter((_: any, x: number) => x !== i));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Programas de Academia</h1>
          <p className="text-sm text-muted-foreground">Diplomados, cursos y talleres de la Academia de Comercio Exterior.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Nuevo programa</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar programa" : "Nuevo programa"}</DialogTitle>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Estado *</Label>
                  <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5"><Label>Nombre *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Dirigido a</Label><Textarea rows={2} value={form.dirigido_a} onChange={(e) => setForm({ ...form, dirigido_a: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Certificación</Label><Textarea rows={2} value={form.certificacion} onChange={(e) => setForm({ ...form, certificacion: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Modalidad</Label>
                  <Select value={form.modalidad} onValueChange={(v) => setForm({ ...form, modalidad: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MODALIDADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label>Duración (horas)</Label><Input type="number" value={form.duracion_horas} onChange={(e) => setForm({ ...form, duracion_horas: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Cupo máximo</Label><Input type="number" value={form.cupo_maximo} onChange={(e) => setForm({ ...form, cupo_maximo: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5"><Label>Cant. encuentros</Label><Input type="number" value={form.cantidad_encuentros} onChange={(e) => setForm({ ...form, cantidad_encuentros: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Horas por encuentro</Label><Input type="number" step="0.1" value={form.horas_por_encuentro} onChange={(e) => setForm({ ...form, horas_por_encuentro: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Descuento por referido (%)</Label><Input type="number" step="0.01" value={form.descuento_referido_pct} onChange={(e) => setForm({ ...form, descuento_referido_pct: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5"><Label>Precio</Label><Input type="number" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label>Moneda</Label>
                  <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="DOP">DOP</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Fecha inicio</Label><Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Fecha fin</Label><Input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></div>
              </div>

              {/* Metodología */}
              <div className="grid gap-2 p-3 border rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Metodología</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addMet}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
                </div>
                {(form.metodologia as string[]).map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={v} onChange={(e) => updMet(i, e.target.value)} placeholder="Ej. Clases magistrales y participativas" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => rmMet(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {form.metodologia.length === 0 && <p className="text-xs text-muted-foreground">Sin elementos.</p>}
              </div>

              {/* Temario */}
              <div className="grid gap-3 p-3 border rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Temario</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addModulo}><Plus className="h-3 w-3 mr-1" />Agregar módulo</Button>
                </div>
                {(form.temario as any[]).map((m, i) => (
                  <div key={i} className="border rounded p-2 bg-muted/20 grid gap-2">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-semibold text-muted-foreground w-8">#{i + 1}</span>
                      <Input value={m.titulo} onChange={(e) => updModulo(i, { titulo: e.target.value })} placeholder="Título del módulo" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => rmModulo(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="pl-10 grid gap-1.5">
                      {(m.subtemas ?? []).map((s: string, j: number) => (
                        <div key={j} className="flex gap-2">
                          <Input value={s} onChange={(e) => updSub(i, j, e.target.value)} placeholder="Subtema" className="h-8" />
                          <Button type="button" size="icon" variant="ghost" onClick={() => rmSub(i, j)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      <Button type="button" size="sm" variant="ghost" onClick={() => addSub(i)} className="justify-start"><Plus className="h-3 w-3 mr-1" />Subtema</Button>
                    </div>
                  </div>
                ))}
                {form.temario.length === 0 && <p className="text-xs text-muted-foreground">Sin módulos.</p>}
              </div>

              {/* Plan de pago */}
              <div className="grid gap-2 p-3 border rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Plan de pago</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addCuota}><Plus className="h-3 w-3 mr-1" />Agregar cuota</Button>
                </div>
                {(form.plan_pago as any[]).map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                    <Input value={c.descripcion} onChange={(e) => updCuota(i, { descripcion: e.target.value })} placeholder="Ej. Al inscribirse" />
                    <Input type="number" step="0.01" value={c.porcentaje} onChange={(e) => updCuota(i, { porcentaje: e.target.value })} placeholder="%" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => rmCuota(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">Total</span>
                  <span className={`tabular-nums font-semibold ${Math.abs(totalPct - 100) > 0.01 && form.plan_pago.length > 0 ? "text-destructive" : "text-emerald-600"}`}>{totalPct.toFixed(2)}%</span>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p: any) => {
          const activas = activasPorPrograma.get(p.id) ?? 0;
          const cuposRest = p.cupo_maximo != null ? p.cupo_maximo - activas : null;
          return (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{p.nombre}</CardTitle>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Badge variant="outline">{p.tipo}</Badge>
                    <Badge variant="secondary">{p.estado}</Badge>
                    <Badge variant="outline">{p.modalidad}</Badge>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setDetalle(p)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {p.descripcion && <p className="text-muted-foreground line-clamp-2">{p.descripcion}</p>}
                <div className="flex justify-between"><span className="text-muted-foreground">Precio</span><span className="tabular-nums">{Number(p.precio).toFixed(2)} {p.moneda}</span></div>
                {p.duracion_horas != null && <div className="flex justify-between"><span className="text-muted-foreground">Duración</span><span>{p.duracion_horas} h</span></div>}
                {p.cantidad_encuentros != null && <div className="flex justify-between"><span className="text-muted-foreground">Encuentros</span><span>{p.cantidad_encuentros}{p.horas_por_encuentro ? ` × ${p.horas_por_encuentro}h` : ""}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Inscripciones</span><span>{activas}{p.cupo_maximo != null ? ` / ${p.cupo_maximo}` : ""}</span></div>
                {cuposRest != null && <div className="flex justify-between"><span className="text-muted-foreground">Cupos disponibles</span><span className={cuposRest <= 0 ? "text-destructive font-semibold" : ""}>{Math.max(0, cuposRest)}</span></div>}
                {Number(p.descuento_referido_pct) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desc. referido</span><span>{Number(p.descuento_referido_pct)}%</span></div>}
                {(p.fecha_inicio || p.fecha_fin) && <div className="flex justify-between text-xs text-muted-foreground pt-1"><span>{p.fecha_inicio ?? "—"}</span><span>→ {p.fecha_fin ?? "—"}</span></div>}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No hay programas.</div>}
      </div>

      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => { if (!o) setDetalle(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>{detalle.nombre}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="outline">{detalle.tipo}</Badge>
                  <Badge variant="secondary">{detalle.estado}</Badge>
                  <Badge variant="outline">{detalle.modalidad}</Badge>
                </div>
                {detalle.descripcion && <p className="text-muted-foreground">{detalle.descripcion}</p>}
                {detalle.dirigido_a && (
                  <div><div className="font-semibold mb-1">Dirigido a</div><p className="text-muted-foreground whitespace-pre-line">{detalle.dirigido_a}</p></div>
                )}
                {detalle.certificacion && (
                  <div><div className="font-semibold mb-1">Certificación</div><p className="text-muted-foreground whitespace-pre-line">{detalle.certificacion}</p></div>
                )}
                {Array.isArray(detalle.metodologia) && detalle.metodologia.length > 0 && (
                  <div>
                    <div className="font-semibold mb-1">Metodología</div>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {detalle.metodologia.map((m: string, i: number) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {Array.isArray(detalle.temario) && detalle.temario.length > 0 && (
                  <div>
                    <div className="font-semibold mb-2">Temario</div>
                    <div className="space-y-3">
                      {detalle.temario.map((m: any, i: number) => (
                        <div key={i}>
                          <div className="font-medium">{m.numero ?? i + 1}. {m.titulo}</div>
                          {Array.isArray(m.subtemas) && m.subtemas.length > 0 && (
                            <ul className="list-disc pl-6 text-muted-foreground text-[13px]">
                              {m.subtemas.map((s: string, j: number) => <li key={j}>{s}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(detalle.plan_pago) && detalle.plan_pago.length > 0 && (
                  <div>
                    <div className="font-semibold mb-1">Plan de pago</div>
                    <ul className="text-muted-foreground">
                      {detalle.plan_pago.map((c: any, i: number) => (
                        <li key={i} className="flex justify-between border-b py-1"><span>{i + 1}. {c.descripcion}</span><span className="tabular-nums">{Number(c.porcentaje)}%</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
