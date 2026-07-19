import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

  const { data: estudiantes } = useQuery({
    queryKey: ["academia-estudiantes"],
    queryFn: async () =>
      ((await (supabase as any).from("estudiantes").select("*").order("created_at", { ascending: false })).data ?? []) as any[],
  });

  const save = useMutation({
    mutationFn: async (payload: any) => {
      if (editing) {
        const { error } = await (supabase as any).from("estudiantes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("estudiantes").insert({ ...payload, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Estudiante actualizado" : "Estudiante creado");
      qc.invalidateQueries({ queryKey: ["academia-estudiantes"] });
      setOpen(false); setEditing(null); setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (estudiantes ?? []).filter((s: any) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return s.nombre?.toLowerCase().includes(t) || s.cedula_pasaporte?.toLowerCase().includes(t) || s.email?.toLowerCase().includes(t);
  });

  const openEdit = (s: any) => { setEditing(s); setForm({ ...empty, ...s }); setOpen(true); };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Estudiantes</h1>
          <p className="text-sm text-muted-foreground">Personas registradas en la Academia.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); } }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nuevo estudiante</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar estudiante" : "Nuevo estudiante"}</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <div className="grid gap-1.5"><Label>Nombre *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Cédula / Pasaporte</Label><Input value={form.cedula_pasaporte ?? ""} onChange={(e) => setForm({ ...form, cedula_pasaporte: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Empresa</Label><Input value={form.empresa ?? ""} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando..." : "Guardar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
                  <td className="p-3">{s.email ?? "—"}</td>
                  <td className="p-3">{s.telefono ?? "—"}</td>
                  <td className="p-3">{s.empresa ?? "—"}</td>
                  <td className="p-3 text-right"><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
