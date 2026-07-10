import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/expedientes/papelera")({
  component: Papelera,
});

function Papelera() {
  const qc = useQueryClient();
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const isAdmin = roles?.includes("admin");

  const [toRestore, setToRestore] = useState<{ id: string; numero: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; numero: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data } = useQuery({
    queryKey: ["expedientes-papelera"],
    enabled: !!isAdmin,
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("*, clientes(nombre)")
      .not("eliminado_en", "is", null)
      .order("eliminado_en", { ascending: false })).data ?? [],
  });

  const restoreMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("expedientes")
        .update({ eliminado_en: null, eliminado_por: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expediente restaurado");
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes-papelera"] });
      setToRestore(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo restaurar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expedientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expediente eliminado permanentemente");
      qc.invalidateQueries({ queryKey: ["expedientes-papelera"] });
      setToDelete(null);
      setConfirmText("");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  if (rolesLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Acceso restringido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>La Papelera de Reciclaje solo está disponible para usuarios con rol <strong>Administrador</strong>.</p>
            <Button asChild variant="outline"><Link to="/expedientes">Volver a Expedientes</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Trash2 className="h-6 w-6" /> Papelera de Expedientes
        </h1>
        <p className="text-sm text-muted-foreground">Expedientes eliminados. Puedes restaurarlos o borrarlos definitivamente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length} expedientes en papelera</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">La papelera está vacía.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                <tr>
                  <th className="text-left px-4 py-2">Expediente</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-left">DUA</th>
                  <th className="text-left">BL / AWB</th>
                  <th className="text-left">ETA</th>
                  <th className="text-left">Puerto Arribo</th>
                  <th className="text-left">Estado</th>
                  <th className="text-left">Eliminado el</th>
                  <th className="text-right px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">{e.numero}</td>
                    <td>{e.clientes?.nombre ?? "—"}</td>
                    <td className="text-xs">{e.numero_dua ?? "—"}</td>
                    <td className="text-muted-foreground">{e.bl_awb ?? "—"}</td>
                    <td>{e.fecha_compromiso ? new Date(e.fecha_compromiso).toLocaleDateString("es-DO") : "—"}</td>
                    <td className="text-xs">{e.puerto_arribo ?? "—"}</td>
                    <td><Badge variant="outline">{e.estado?.replace("_"," ")}</Badge></td>
                    <td className="text-xs text-muted-foreground">{e.eliminado_en ? new Date(e.eliminado_en).toLocaleString("es-DO") : "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setToRestore({ id: e.id, numero: e.numero })}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => { setToDelete({ id: e.id, numero: e.numero }); setConfirmText(""); }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toRestore} onOpenChange={(o) => !o && setToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar expediente</AlertDialogTitle>
            <AlertDialogDescription>
              El expediente <strong>{toRestore?.numero}</strong> volverá a la lista principal de Expedientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toRestore) restoreMut.mutate(toRestore.id); }}
            >
              {restoreMut.isPending ? "Restaurando…" : "Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) { setToDelete(null); setConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Eliminar definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Esta acción es <strong>irreversible</strong>. Se borrará el expediente <strong>{toDelete?.numero}</strong> junto
                  con sus documentos, incidencias, costos y auditoría asociados.
                </p>
                <p>Escribe <strong>ELIMINAR</strong> para confirmar:</p>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ELIMINAR" autoFocus />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending || confirmText !== "ELIMINAR"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(ev) => { ev.preventDefault(); if (toDelete && confirmText === "ELIMINAR") deleteMut.mutate(toDelete.id); }}
            >
              {deleteMut.isPending ? "Eliminando…" : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
