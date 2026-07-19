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
import { Plus, Pencil } from "lucide-react";
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
} as any;

function Programas() {
  const qc = useQueryClient();
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);

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

  const save = useMutation({
    mutationFn: async (payload: any) => {
      const clean = {
        ...payload,
        duracion_horas: payload.duracion_horas ? Number(payload.duracion_horas) : null,
        cupo_maximo: payload.cupo_maximo ? Number(payload.cupo_maximo) : null,
        precio: Number(payload.precio || 0),
        fecha_inicio: payload.fecha_inicio || null,
        fecha_fin: payload.fecha_fin || null,
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
    });
    setOpen(true);
  };

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
          <DialogContent className="max-w-2xl">
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
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline">{p.tipo}</Badge>
                    <Badge variant="secondary">{p.estado}</Badge>
                    <Badge variant="outline">{p.modalidad}</Badge>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {p.descripcion && <p className="text-muted-foreground line-clamp-2">{p.descripcion}</p>}
                <div className="flex justify-between"><span className="text-muted-foreground">Precio</span><span className="tabular-nums">{Number(p.precio).toFixed(2)} {p.moneda}</span></div>
                {p.duracion_horas != null && <div className="flex justify-between"><span className="text-muted-foreground">Duración</span><span>{p.duracion_horas} h</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Inscripciones</span><span>{activas}{p.cupo_maximo != null ? ` / ${p.cupo_maximo}` : ""}</span></div>
                {cuposRest != null && <div className="flex justify-between"><span className="text-muted-foreground">Cupos disponibles</span><span className={cuposRest <= 0 ? "text-destructive font-semibold" : ""}>{Math.max(0, cuposRest)}</span></div>}
                {(p.fecha_inicio || p.fecha_fin) && <div className="flex justify-between text-xs text-muted-foreground pt-1"><span>{p.fecha_inicio ?? "—"}</span><span>→ {p.fecha_fin ?? "—"}</span></div>}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No hay programas.</div>}
      </div>
    </div>
  );
}
