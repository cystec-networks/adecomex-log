import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/solicitudes/")({
  component: Solicitudes,
});

const ESTADOS = ["recibida", "en_revision", "aprobada", "rechazada", "convertida"];

function Solicitudes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("todas");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["solicitudes"],
    queryFn: async () => (await supabase
      .from("solicitudes")
      .select("*, clientes(nombre)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("solicitudes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud movida a la papelera");
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      qc.invalidateQueries({ queryKey: ["papelera-solicitudes"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover a papelera"),
  });

  const filtered = (data ?? []).filter((s: any) => {
    if (estado !== "todas" && s.estado !== estado) return false;
    if (q && !JSON.stringify(s).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Solicitudes</h1>
          <p className="text-sm text-muted-foreground">Recepción de solicitudes de importación.</p>
        </div>
        <Button asChild><Link to="/solicitudes/nueva"><Plus className="h-4 w-4 mr-1" />Nueva solicitud</Link></Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1">{filtered.length} solicitudes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Número</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Origen</th>
                <th className="text-left">Arribo</th>
                <th className="text-left">Prioridad</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Registrado</th>
                <th className="text-right px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/solicitudes/$id" params={{ id: s.id }} className="hover:underline text-primary">{s.numero}</Link>
                  </td>
                  <td>{s.clientes?.nombre ?? "—"}</td>
                  <td className="text-muted-foreground">{s.tipo_operacion ?? "—"}</td>
                  <td>{s.origen ?? "—"}</td>
                  <td>{s.fecha_arribo_est ? new Date(s.fecha_arribo_est).toLocaleDateString("es-DO") : "—"}</td>
                  <td><Badge className="bg-muted text-muted-foreground border-transparent">{s.prioridad}</Badge></td>
                  <td><Badge className="bg-primary/10 text-primary border-transparent">{s.estado?.replace("_", " ")}</Badge></td>
                  <td className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-DO")}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setToTrash({ id: s.id, numero: s.numero })}
                      title="Mover a la papelera"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin solicitudes.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas mover la solicitud <strong>{toTrash?.numero}</strong> a la papelera?
              Podrás restaurarla desde <em>Papelera</em>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}
            >
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
