import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Trash, RotateCcw, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/rrhh/empleados")({
  component: Empleados,
});

const empty: any = {
  nombre: "", cedula: "", fecha_nacimiento: "", direccion: "", telefono: "", email: "",
  cargo: "", departamento: "", fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_baja: "", motivo_baja: "", tipo_contrato: "indefinido",
  salario_base: "", moneda: "DOP", numero_tss: "", afp: "", ars: "",
  estado: "activo", notas: "",
};

const TIPO_CONTRATO = [
  { v: "indefinido", l: "Indefinido" },
  { v: "tiempo_determinado", l: "Tiempo determinado" },
  { v: "por_cierta_obra", l: "Por cierta obra o servicio" },
  { v: "entrenamiento", l: "Entrenamiento" },
];

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-700",
  inactivo: "bg-amber-100 text-amber-700",
  baja: "bg-rose-100 text-rose-700",
};

function Empleados() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("todos");
  const [depto, setDepto] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [toDelete, setToDelete] = useState<any>(null);
  const [papeleraOpen, setPapeleraOpen] = useState(false);

  const { data: roles } = useMyRoles();
  const isAdmin = (roles ?? []).includes("admin");

  const { data: empleados } = useQuery({
    queryKey: ["rrhh-empleados"],
    queryFn: async () =>
      ((await (supabase as any).from("empleados").select("*").is("deleted_at", null).order("nombre", { ascending: true })).data ?? []) as any[],
  });

  const { data: papelera } = useQuery({
    queryKey: ["rrhh-empleados-papelera"],
    enabled: papeleraOpen,
    queryFn: async () =>
      ((await (supabase as any).from("empleados").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false })).data ?? []) as any[],
  });

  const departamentos = Array.from(
    new Set((empleados ?? []).map((e: any) => e.departamento).filter(Boolean)),
  ) as string[];

  const save = useMutation({
    mutationFn: async (payload: any) => {
      const { data: u } = await supabase.auth.getUser();
      const clean: any = { ...payload };
      // Normalizar vacíos
      for (const k of Object.keys(clean)) {
        if (clean[k] === "") clean[k] = null;
      }
      if (clean.salario_base != null) clean.salario_base = Number(clean.salario_base);
      clean.created_by = u.user?.id ?? null;
      const { error } = await (supabase as any).from("empleados").insert(clean);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empleado creado");
      qc.invalidateQueries({ queryKey: ["rrhh-empleados"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("empleados")
        .update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empleado movido a la papelera");
      qc.invalidateQueries({ queryKey: ["rrhh-empleados"] });
      qc.invalidateQueries({ queryKey: ["rrhh-empleados-papelera"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("empleados")
        .update({ deleted_at: null, deleted_by: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empleado restaurado");
      qc.invalidateQueries({ queryKey: ["rrhh-empleados"] });
      qc.invalidateQueries({ queryKey: ["rrhh-empleados-papelera"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (empleados ?? []).filter((e: any) => {
    if (estado !== "todos" && e.estado !== estado) return false;
    if (depto !== "todos" && e.departamento !== depto) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!(e.nombre?.toLowerCase().includes(t) || e.cedula?.toLowerCase().includes(t))) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Empleados</h1>
          <p className="text-sm text-muted-foreground">Registro de personal — Gestión Humana.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setPapeleraOpen(true)}>
              <Trash className="h-4 w-4 mr-1" />Ver papelera
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(empty)}><Plus className="h-4 w-4 mr-1" />Nuevo empleado</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
              <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Nombre completo *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Cédula</Label><Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5"><Label>Fecha nacimiento</Label><Input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="grid gap-1.5"><Label>Dirección</Label><Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Cargo</Label><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Departamento</Label><Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5"><Label>Fecha ingreso *</Label><Input required type="date" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Fecha baja</Label><Input type="date" value={form.fecha_baja} onChange={(e) => setForm({ ...form, fecha_baja: e.target.value })} /></div>
                  <div className="grid gap-1.5">
                    <Label>Tipo contrato</Label>
                    <Select value={form.tipo_contrato} onValueChange={(v) => setForm({ ...form, tipo_contrato: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPO_CONTRATO.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.fecha_baja && (
                  <div className="grid gap-1.5"><Label>Motivo de baja</Label><Input value={form.motivo_baja} onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })} /></div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5"><Label>Salario base</Label><Input type="number" step="0.01" value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Moneda</Label><Input value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value.toUpperCase() })} /></div>
                  <div className="grid gap-1.5">
                    <Label>Estado</Label>
                    <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                        <SelectItem value="baja">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5"><Label>Número TSS</Label><Input value={form.numero_tss} onChange={(e) => setForm({ ...form, numero_tss: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>AFP</Label><Input value={form.afp} onChange={(e) => setForm({ ...form, afp: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ARS</Label><Input value={form.ars} onChange={(e) => setForm({ ...form, ars: e.target.value })} /></div>
                </div>
                <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
                <DialogFooter>
                  <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Guardar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nombre o cédula..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="inactivo">Inactivo</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={depto} onValueChange={setDepto}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los departamentos</SelectItem>
            {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Cédula</th>
                <th className="text-left p-3">Cargo</th>
                <th className="text-left p-3">Departamento</th>
                <th className="text-left p-3">Ingreso</th>
                <th className="text-left p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{e.nombre}</td>
                  <td className="p-3">{e.cedula ?? "—"}</td>
                  <td className="p-3">{e.cargo ?? "—"}</td>
                  <td className="p-3">{e.departamento ?? "—"}</td>
                  <td className="p-3">{e.fecha_ingreso ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={ESTADO_COLOR[e.estado] ?? ""}>{e.estado}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link to="/rrhh/empleados/$id" params={{ id: e.id }}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(e)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar empleado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar a <b>{toDelete?.nombre}</b>? Se moverá a la papelera y podrás restaurarlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); del.mutate(toDelete.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={papeleraOpen} onOpenChange={setPapeleraOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Papelera de empleados</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">Cédula</th>
                  <th className="text-left p-2">Eliminado</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(papelera ?? []).map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2 font-medium">{e.nombre}</td>
                    <td className="p-2">{e.cedula ?? "—"}</td>
                    <td className="p-2">{e.deleted_at ? new Date(e.deleted_at).toLocaleString() : "—"}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(e.id)} disabled={restore.isPending}>
                        <RotateCcw className="h-4 w-4 mr-1" />Restaurar
                      </Button>
                    </td>
                  </tr>
                ))}
                {(papelera ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Papelera vacía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
