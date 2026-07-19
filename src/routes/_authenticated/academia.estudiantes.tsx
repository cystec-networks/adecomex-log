import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, AlertCircle, Trash, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/academia/estudiantes")({
  component: Estudiantes,
});

const empty = { nombre: "", cedula_pasaporte: "", email: "", telefono: "", empresa: "", notas: "" } as any;

function Estudiantes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);
  const [asignarCorreo, setAsignarCorreo] = useState(false);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [toDelete, setToDelete] = useState<any>(null);

  const { data: roles } = useMyRoles();
  const isAdmin = (roles ?? []).includes("admin");

  const { data: estudiantes } = useQuery({
    queryKey: ["academia-estudiantes"],
    queryFn: async () =>
      ((await (supabase as any).from("estudiantes").select("*").is("deleted_at", null).order("created_at", { ascending: false })).data ?? []) as any[],
  });

  const [papeleraOpen, setPapeleraOpen] = useState(false);
  const { data: papelera } = useQuery({
    queryKey: ["academia-estudiantes-papelera"],
    enabled: papeleraOpen,
    queryFn: async () =>
      ((await (supabase as any).from("estudiantes").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false })).data ?? []) as any[],
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("estudiantes").update({ deleted_at: null, deleted_by: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estudiante restaurado");
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      qc.invalidateQueries({ queryKey: ["academia-estudiantes-papelera"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (payload: any) => {
      const { correo_generado: _cg, ...rest } = payload;
      const clean = { ...rest, email: rest.email?.trim() ? rest.email.trim() : null };
      if (editing) {
        const { error } = await (supabase as any).from("estudiantes").update(clean).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("estudiantes").insert({ ...clean, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Estudiante actualizado" : "Estudiante creado");
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      resetDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const asignarCorreoReal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("actualizar-correo-estudiante", {
        body: { estudiante_id: editing.id, nuevo_correo: nuevoCorreo.trim().toLowerCase() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data: any) => {
      if (data?.warning) toast.warning(data.warning);
      else toast.success("Correo real asignado");
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      resetDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("estudiantes").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estudiante movido a la papelera");
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      qc.invalidateQueries({ queryKey: ["academia-estudiantes-papelera"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetDialog() {
    setOpen(false); setEditing(null); setForm(empty); setAsignarCorreo(false); setNuevoCorreo("");
  }

  const filtered = (estudiantes ?? []).filter((s: any) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return s.nombre?.toLowerCase().includes(t) || s.cedula_pasaporte?.toLowerCase().includes(t) || s.email?.toLowerCase().includes(t);
  });

  const openEdit = (s: any) => { setEditing(s); setForm({ ...empty, ...s }); setOpen(true); };
  const isGen = editing?.correo_generado;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Estudiantes</h1>
          <p className="text-sm text-muted-foreground">Personas registradas en la Academia.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setPapeleraOpen(true)}>
              <Trash className="h-4 w-4 mr-1" />Ver papelera
            </Button>
          )}
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
          <DialogTrigger asChild><Button onClick={() => { setEditing(null); setForm(empty); }}><Plus className="h-4 w-4 mr-1" />Nuevo estudiante</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar estudiante" : "Nuevo estudiante"}</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <div className="grid gap-1.5"><Label>Nombre *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Cédula / Pasaporte</Label><Input value={form.cedula_pasaporte ?? ""} onChange={(e) => setForm({ ...form, cedula_pasaporte: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Empresa</Label><Input value={form.empresa ?? ""} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Email (opcional)</Label>
                  {editing && isGen ? (
                    <>
                      <Input value={form.email ?? ""} disabled className="text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Correo generado automáticamente, no se usa para comunicación.</p>
                      {!asignarCorreo ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setAsignarCorreo(true)}>
                          Asignar correo real
                        </Button>
                      ) : (
                        <div className="grid gap-1.5">
                          <Input
                            type="email"
                            placeholder="estudiante@dominio.com"
                            value={nuevoCorreo}
                            onChange={(e) => setNuevoCorreo(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={asignarCorreoReal.isPending || !nuevoCorreo.trim()}
                              onClick={() => asignarCorreoReal.mutate()}
                            >
                              {asignarCorreoReal.isPending ? "Guardando…" : "Guardar correo real"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => { setAsignarCorreo(false); setNuevoCorreo(""); }}>Cancelar</Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  )}
                </div>
                <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Guardar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Input placeholder="Buscar por nombre, cédula o email..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Cédula/Pasaporte</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-left p-3">Empresa</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-medium">{s.nombre}</td>
                  <td className="p-3">{s.cedula_pasaporte ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={s.correo_generado ? "text-muted-foreground italic" : ""}>{s.email ?? "—"}</span>
                      {s.correo_generado && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <AlertCircle className="h-3 w-3" />Sin correo real
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">{s.telefono ?? "—"}</td>
                  <td className="p-3">{s.empresa ?? "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(s)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar estudiante</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar a <b>{toDelete?.nombre}</b>? Se moverá a la papelera y podrás restaurarlo después. Sus inscripciones y accesos existentes NO se eliminan, solo quedan ocultos mientras esté en la papelera.
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
          <DialogHeader><DialogTitle>Papelera de estudiantes</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Eliminado</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(papelera ?? []).map((s: any) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 font-medium">{s.nombre}</td>
                    <td className="p-2">{s.email ?? "—"}</td>
                    <td className="p-2">{s.deleted_at ? new Date(s.deleted_at).toLocaleString() : "—"}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(s.id)} disabled={restore.isPending}>
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
