import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Clientes,
});

const empty = { nombre: "", rnc: "", contacto: "", email: "", telefono: "", direccion: "" };

function Clientes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);
  const [asignarCorreo, setAsignarCorreo] = useState(false);
  const [nuevoCorreo, setNuevoCorreo] = useState("");

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (payload: any) => {
      const { correo_generado: _cg, ...rest } = payload;
      const clean = { ...rest, email: rest.email?.trim() ? rest.email.trim() : null };
      if (editing) {
        const { error } = await supabase.from("clientes").update(clean).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clientes").insert(clean);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente actualizado" : "Cliente creado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      resetDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const asignarCorreoReal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("actualizar-correo-cliente", {
        body: { cliente_id: editing.id, nuevo_correo: nuevoCorreo.trim().toLowerCase() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data: any) => {
      if (data?.warning) toast.warning(data.warning);
      else toast.success("Correo real asignado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      resetDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetDialog() {
    setOpen(false); setEditing(null); setForm(empty); setAsignarCorreo(false); setNuevoCorreo("");
  }

  const filtered = (clientes ?? []).filter((c: any) =>
    !q || c.nombre?.toLowerCase().includes(q.toLowerCase()) || c.rnc?.includes(q)
  );

  const isGen = editing?.correo_generado;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Empresas consignatarias registradas.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setForm(empty); }}><Plus className="h-4 w-4 mr-1" />Nuevo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
            >
              <div className="grid gap-1.5"><Label>Nombre / Razón social *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>RNC</Label><Input value={form.rnc ?? ""} onChange={(e) => setForm({ ...form, rnc: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Contacto</Label><Input value={form.contacto ?? ""} onChange={(e) => setForm({ ...form, contacto: e.target.value })} /></div>
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
                            placeholder="cliente@dominio.com"
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
              <div className="grid gap-1.5"><Label>Dirección</Label><Textarea value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={save.isPending}>Guardar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{filtered.length} clientes</CardTitle>
          <Input placeholder="Buscar por nombre o RNC…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left">RNC</th>
                <th className="text-left">Contacto</th>
                <th className="text-left">Email</th>
                <th className="text-left">Teléfono</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{c.nombre}</td>
                  <td className="text-muted-foreground">{c.rnc ?? "—"}</td>
                  <td>{c.contacto ?? "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={c.correo_generado ? "text-muted-foreground italic" : ""}>{c.email ?? "—"}</span>
                      {c.correo_generado && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <AlertCircle className="h-3 w-3" />Sin correo real
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td>{c.telefono ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setForm({ ...empty, ...c }); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin clientes registrados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
