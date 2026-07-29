import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/catalogo-viajes-transporte")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "transporte"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: CatalogoViajesPage,
  head: () => ({
    meta: [
      { title: "Catálogo de Viajes de Transporte | ADECOMEX" },
      { name: "description", content: "Administra rutas de transporte con precios predefinidos para las solicitudes de pago de transportistas." },
      { property: "og:title", content: "Catálogo de Viajes de Transporte | ADECOMEX" },
      { property: "og:description", content: "Rutas de transporte con precios predefinidos para solicitudes de pago." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Viaje = {
  id: string;
  origen: string;
  destino: string;
  tipo_servicio: string | null;
  precio: number;
  moneda: string;
  activo: boolean;
  notas: string | null;
};

const fmtMoney = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY = { origen: "", destino: "", tipo_servicio: "", precio: "", moneda: "DOP", activo: true, notas: "" };

function CatalogoViajesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [eliminando, setEliminando] = useState<Viaje | null>(null);
  const setF = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["catalogo-viajes-transporte"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("catalogo_viajes_transporte")
        .select("*")
        .order("origen", { ascending: true })
        .order("destino", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Viaje[];
    },
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = {
        origen: form.origen.trim(),
        destino: form.destino.trim(),
        tipo_servicio: form.tipo_servicio.trim() || null,
        precio: Number(form.precio || 0),
        moneda: form.moneda,
        activo: form.activo,
        notas: form.notas.trim() || null,
      };
      if (editingId) {
        const { error } = await (supabase as any)
          .from("catalogo_viajes_transporte").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from("catalogo_viajes_transporte")
          .insert({ ...payload, created_by: u.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Viaje actualizado" : "Viaje creado");
      setOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["catalogo-viajes-transporte"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const toggleActivo = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await (supabase as any)
        .from("catalogo_viajes_transporte").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalogo-viajes-transporte"] }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("catalogo_viajes_transporte").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Viaje eliminado");
      setEliminando(null);
      qc.invalidateQueries({ queryKey: ["catalogo-viajes-transporte"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  const abrirNuevo = () => { setEditingId(null); setForm({ ...EMPTY }); setOpen(true); };
  const abrirEdicion = (v: Viaje) => {
    setEditingId(v.id);
    setForm({
      origen: v.origen ?? "",
      destino: v.destino ?? "",
      tipo_servicio: v.tipo_servicio ?? "",
      precio: String(v.precio ?? ""),
      moneda: v.moneda ?? "DOP",
      activo: !!v.activo,
      notas: v.notas ?? "",
    });
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.origen.trim() || !form.destino.trim()) return toast.error("Indica origen y destino");
    guardar.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Catálogo de Viajes</h1>
          <p className="text-sm text-muted-foreground">
            Rutas con precios predefinidos que el transportista puede seleccionar en la solicitud de pago pública.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus className="h-4 w-4" /> Nuevo viaje
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rutas registradas</CardTitle>
          <CardDescription>{rows.length} viaje(s) en el catálogo</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2 text-left">Origen</th>
                <th className="px-2 py-2 text-left">Destino</th>
                <th className="px-2 py-2 text-left">Tipo de servicio</th>
                <th className="px-2 py-2 text-right">Precio</th>
                <th className="px-2 py-2 text-center">Moneda</th>
                <th className="px-2 py-2 text-center">Activo</th>
                <th className="px-2 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Aún no hay viajes registrados.</td></tr>
              )}
              {rows.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-2 py-2 font-medium">{v.origen}</td>
                  <td className="px-2 py-2">{v.destino}</td>
                  <td className="px-2 py-2 text-muted-foreground">{v.tipo_servicio ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(Number(v.precio), v.moneda)}</td>
                  <td className="px-2 py-2 text-center">
                    <Badge variant="outline">{v.moneda}</Badge>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Switch
                      checked={v.activo}
                      onCheckedChange={(c) => toggleActivo.mutate({ id: v.id, activo: c })}
                      aria-label="Activo"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicion(v)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEliminando(v)} aria-label="Eliminar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar viaje" : "Nuevo viaje"}</DialogTitle>
            <DialogDescription>Define la ruta, el tipo de servicio y su precio.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="origen">Origen *</Label>
              <Input id="origen" value={form.origen} onChange={(e) => setF("origen", e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="destino">Destino *</Label>
              <Input id="destino" value={form.destino} onChange={(e) => setF("destino", e.target.value)} required />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="tipo">Tipo de servicio</Label>
              <Input id="tipo" placeholder="Transporte de contenedores" value={form.tipo_servicio} onChange={(e) => setF("tipo_servicio", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="precio">Precio</Label>
              <Input
                id="precio"
                inputMode="decimal"
                value={form.precio}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setF("precio", v);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Moneda</Label>
              <Select value={form.moneda} onValueChange={(v) => setF("moneda", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch id="activo" checked={form.activo} onCheckedChange={(c) => setF("activo", c)} />
              <Label htmlFor="activo">Activo (visible en el formulario público)</Label>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" rows={3} value={form.notas} onChange={(e) => setF("notas", e.target.value)} />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardar.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!eliminando} onOpenChange={(o) => !o && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar viaje</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar el viaje {eliminando?.origen} → {eliminando?.destino}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => eliminando && eliminar.mutate(eliminando.id)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
