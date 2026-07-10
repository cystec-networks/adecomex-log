import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";

type Kind = "expedientes" | "solicitudes";

export const Route = createFileRoute("/_authenticated/expedientes/papelera")({
  component: Papelera,
});

function Papelera() {
  const qc = useQueryClient();
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const isAdmin = roles?.includes("admin");

  const [tab, setTab] = useState<Kind>("expedientes");
  const [toRestore, setToRestore] = useState<{ kind: Kind; id: string; numero: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: Kind; id: string; numero: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const expedientes = useQuery({
    queryKey: ["papelera-expedientes"],
    enabled: !!isAdmin,
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("*, clientes(nombre)")
      .not("eliminado_en", "is", null)
      .order("eliminado_en", { ascending: false })).data ?? [],
  });

  const solicitudes = useQuery({
    queryKey: ["papelera-solicitudes"],
    enabled: !!isAdmin,
    queryFn: async () => (await supabase
      .from("solicitudes")
      .select("*, clientes(nombre)")
      .not("eliminado_en", "is", null)
      .order("eliminado_en", { ascending: false })).data ?? [],
  });

  const restoreMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: Kind; id: string }) => {
      const { error } = await supabase
        .from(kind)
        .update({ eliminado_en: null, eliminado_por: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.kind === "expedientes" ? "Expediente restaurado" : "Solicitud restaurada");
      qc.invalidateQueries({ queryKey: [vars.kind] });
      qc.invalidateQueries({ queryKey: [`papelera-${vars.kind}`] });
      setToRestore(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo restaurar"),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: Kind; id: string }) => {
      const { error } = await supabase.from(kind).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Registro eliminado permanentemente");
      qc.invalidateQueries({ queryKey: [`papelera-${vars.kind}`] });
      setToDelete(null);
      setConfirmText("");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  if (rolesLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;

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

  const expRows = expedientes.data ?? [];
  const solRows = solicitudes.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Trash2 className="h-6 w-6" /> Papelera de Reciclaje
        </h1>
        <p className="text-sm text-muted-foreground">
          Registros eliminados. Puedes restaurarlos o borrarlos definitivamente.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList>
          <TabsTrigger value="expedientes">Expedientes ({expRows.length})</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes ({solRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="expedientes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expedientes eliminados: {expRows.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {expRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin expedientes en papelera.</div>
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
                    {expRows.map((e: any) => (
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
                          <Button variant="ghost" size="sm" onClick={() => setToRestore({ kind: "expedientes", id: e.id, numero: e.numero })}>
                            <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setToDelete({ kind: "expedientes", id: e.id, numero: e.numero }); setConfirmText(""); }}
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
        </TabsContent>

        <TabsContent value="solicitudes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Solicitudes eliminadas: {solRows.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {solRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin solicitudes en papelera.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                    <tr>
                      <th className="text-left px-4 py-2">Número</th>
                      <th className="text-left">Cliente</th>
                      <th className="text-left">Tipo</th>
                      <th className="text-left">Origen</th>
                      <th className="text-left">Arribo</th>
                      <th className="text-left">Prioridad</th>
                      <th className="text-left">Estado</th>
                      <th className="text-left">Eliminado el</th>
                      <th className="text-right px-4 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solRows.map((s: any) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2 font-medium">{s.numero}</td>
                        <td>{s.clientes?.nombre ?? "—"}</td>
                        <td className="text-muted-foreground">{s.tipo_operacion ?? "—"}</td>
                        <td>{s.origen ?? "—"}</td>
                        <td>{s.fecha_arribo_est ? new Date(s.fecha_arribo_est).toLocaleDateString("es-DO") : "—"}</td>
                        <td><Badge className="bg-muted text-muted-foreground border-transparent">{s.prioridad}</Badge></td>
                        <td><Badge className="bg-primary/10 text-primary border-transparent">{s.estado?.replace("_"," ")}</Badge></td>
                        <td className="text-xs text-muted-foreground">{s.eliminado_en ? new Date(s.eliminado_en).toLocaleString("es-DO") : "—"}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => setToRestore({ kind: "solicitudes", id: s.id, numero: s.numero })}>
                            <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setToDelete({ kind: "solicitudes", id: s.id, numero: s.numero }); setConfirmText(""); }}
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
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!toRestore} onOpenChange={(o) => !o && setToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar {toRestore?.kind === "solicitudes" ? "solicitud" : "expediente"}</AlertDialogTitle>
            <AlertDialogDescription>
              El registro <strong>{toRestore?.numero}</strong> volverá a la lista principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toRestore) restoreMut.mutate({ kind: toRestore.kind, id: toRestore.id }); }}
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
                  Esta acción es <strong>irreversible</strong>. Se borrará el registro <strong>{toDelete?.numero}</strong> junto
                  con sus datos asociados.
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
              onClick={(ev) => { ev.preventDefault(); if (toDelete && confirmText === "ELIMINAR") deleteMut.mutate({ kind: toDelete.kind, id: toDelete.id }); }}
            >
              {deleteMut.isPending ? "Eliminando…" : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
