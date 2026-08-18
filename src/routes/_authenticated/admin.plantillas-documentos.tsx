import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { PlantillaEditor } from "@/components/plantilla-editor";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";
import { PLANTILLA_DRCAFTA_USA_HTML } from "@/lib/plantilla-drcafta";

export const Route = createFileRoute("/_authenticated/admin/plantillas-documentos")({
  component: PlantillasDocumentosPage,
  head: () => ({
    meta: [
      { title: "Plantillas de Documentos | ADECOMEX" },
      { name: "description", content: "Editor de plantillas de documentos aduanales con campos de fusión para generar facturas, listas de empaque y certificados." },
      { property: "og:title", content: "Plantillas de Documentos | ADECOMEX" },
      { property: "og:description", content: "Diseña plantillas con campos de fusión y genera documentos desde cada expediente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Plantilla = {
  id: string;
  nombre: string;
  categoria: string;
  contenido_html: string;
  activo: boolean;
  updated_at: string;
};

function PlantillasDocumentosPage() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const isAdmin = (roles ?? []).some((r) => r === "admin");
  const [editando, setEditando] = useState<Partial<Plantilla> | null>(null);
  const [aEliminar, setAEliminar] = useState<Plantilla | null>(null);

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ["plantillas-documentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plantillas_documentos")
        .select("*")
        .order("categoria")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Plantilla[];
    },
  });

  const guardar = useMutation({
    mutationFn: async (p: Partial<Plantilla>) => {
      const payload = {
        nombre: (p.nombre ?? "").trim(),
        categoria: (p.categoria ?? "Otro").trim() || "Otro",
        contenido_html: p.contenido_html ?? "",
        activo: p.activo ?? true,
      };
      if (!payload.nombre) throw new Error("El nombre es obligatorio");
      if (p.id) {
        const { error } = await supabase.from("plantillas_documentos").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("plantillas_documentos")
          .insert({ ...payload, creado_por: u.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Plantilla guardada");
      qc.invalidateQueries({ queryKey: ["plantillas-documentos"] });
      setEditando(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const toggleActivo = useMutation({
    mutationFn: async (p: Plantilla) => {
      const { error } = await supabase
        .from("plantillas_documentos")
        .update({ activo: !p.activo })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plantillas-documentos"] }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const eliminar = useMutation({
    mutationFn: async (p: Plantilla) => {
      const { error } = await supabase.from("plantillas_documentos").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plantilla eliminada");
      qc.invalidateQueries({ queryKey: ["plantillas-documentos"] });
      setAEliminar(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> Plantillas de Documentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Diseña documentos con campos de fusión que se completan con los datos del expediente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setEditando({
                nombre: "Certificado de Origen DR-CAFTA (USA)",
                categoria: "Certificados",
                contenido_html: PLANTILLA_DRCAFTA_USA_HTML,
                activo: true,
              })
            }
          >
            <FileText className="h-4 w-4 mr-1" /> Cargar formato DR-CAFTA
          </Button>
          <Button onClick={() => setEditando({ nombre: "", categoria: "Otro", contenido_html: "", activo: true })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva plantilla
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Plantillas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">Cargando…</div>
          ) : !plantillas?.length ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Aún no hay plantillas.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Categoría</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Última modificación</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {plantillas.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{p.nombre}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.categoria}</td>
                      <td className="px-4 py-2">
                        <Badge variant={p.activo ? "default" : "outline"} className="text-xs">
                          {p.activo ? "Activa" : "Inactiva"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{fmtLocalDate(p.updated_at)}</td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setEditando(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActivo.mutate(p)}>
                          {p.activo ? "Desactivar" : "Activar"}
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAEliminar(p)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nombre</Label>
                  <Input
                    value={editando.nombre ?? ""}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    placeholder="Ej. Factura Comercial"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Input
                    value={editando.categoria ?? ""}
                    onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}
                    placeholder="Comercial, Certificados…"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editando.activo ?? true}
                  onCheckedChange={(v) => setEditando({ ...editando, activo: v })}
                />
                <Label className="font-normal">Plantilla activa</Label>
              </div>

              <PlantillaEditor
                value={editando.contenido_html ?? ""}
                onChange={(html) => setEditando((prev) => (prev ? { ...prev, contenido_html: html } : prev))}
              />

              <p className="text-xs text-muted-foreground">
                Para la tabla de productos, inserta una fila con campos <span className="font-mono">{"{{producto.*}}"}</span>:
                al generar el documento esa fila se repite una vez por cada línea de mercancía del expediente.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={() => editando && guardar.mutate(editando)} disabled={guardar.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la plantilla <strong>{aEliminar?.nombre}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aEliminar && eliminar.mutate(aEliminar)}
              disabled={eliminar.isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
