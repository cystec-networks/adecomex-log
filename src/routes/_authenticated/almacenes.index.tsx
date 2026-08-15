import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/almacenes/")({
  component: AlmacenesPage,
  head: () => ({
    meta: [
      { title: "Almacenes | ADECOMEX" },
      { name: "description", content: "Catálogo de almacenes y ubicaciones para el control de existencias de mercancía nacionalizada." },
      { property: "og:title", content: "Almacenes | ADECOMEX" },
      { property: "og:description", content: "Catálogo de almacenes y ubicaciones para el control de existencias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Almacen = { id: string; nombre: string; ubicacion: string | null; activo: boolean };

function AlmacenesPage() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const isAdmin = !!roles?.includes("admin");

  const { data: almacenes, isLoading } = useQuery({
    queryKey: ["almacenes"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("almacenes" as any) as any)
        .select("id,nombre,ubicacion,activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Almacen[];
    },
  });

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Almacen | null>(null);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [activo, setActivo] = useState(true);

  const abrir = (a?: Almacen) => {
    setEdit(a ?? null);
    setNombre(a?.nombre ?? "");
    setUbicacion(a?.ubicacion ?? "");
    setActivo(a?.activo ?? true);
    setOpen(true);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = { nombre: nombre.trim(), ubicacion: ubicacion.trim() || null, activo };
      if (!payload.nombre) throw new Error("El nombre es obligatorio");
      const q = supabase.from("almacenes" as any) as any;
      const { error } = edit ? await q.update(payload).eq("id", edit.id) : await q.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(edit ? "Almacén actualizado" : "Almacén creado");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["almacenes"] });
      qc.invalidateQueries({ queryKey: ["almacenes-activos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" /> Almacenes
          </h1>
          <p className="text-sm text-muted-foreground">Ubicaciones donde se recibe la mercancía nacionalizada.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => abrir()}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo almacén
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Listado</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (almacenes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay almacenes registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th className="py-2 pr-2">Nombre</th>
                  <th className="py-2 px-2">Ubicación</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 pl-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(almacenes ?? []).map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{a.nombre}</td>
                    <td className="py-2 px-2 text-muted-foreground">{a.ubicacion ?? "—"}</td>
                    <td className="py-2 px-2">
                      {a.activo ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">Activo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Inactivo</Badge>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => abrir(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar almacén" : "Nuevo almacén"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Almacén principal" />
            </div>
            <div className="space-y-1">
              <Label>Ubicación</Label>
              <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Santo Domingo Este" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={activo} onCheckedChange={setActivo} id="activo" />
              <Label htmlFor="activo">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
