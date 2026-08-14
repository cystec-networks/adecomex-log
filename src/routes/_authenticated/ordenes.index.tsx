import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";
import { ORDEN_ESTADO_CLASS, ordenEstadoLabel } from "@/lib/estados-orden";

export const Route = createFileRoute("/_authenticated/ordenes/")({
  component: Ordenes,
});

function Ordenes() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");

  const [q, setQ] = useState("");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["ordenes"],
    queryFn: async () => (await supabase
      .from("ordenes")
      .select("*, clientes(nombre)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ordenes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden movida a la papelera");
      qc.invalidateQueries({ queryKey: ["ordenes"] });
      qc.invalidateQueries({ queryKey: ["papelera-ordenes"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover a papelera"),
  });

  const filtered = (data ?? []).filter((o: any) =>
    !q || JSON.stringify(o).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold">Órdenes</h1>
        <p className="text-sm text-muted-foreground">Órdenes generadas a partir de cotizaciones aprobadas.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1">{filtered.length} órdenes</CardTitle>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          {canEdit && (
            <Button asChild><Link to="/ordenes/nueva"><Plus className="h-4 w-4 mr-1" />Nueva orden</Link></Button>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Número</th>
                <th className="text-left">Cotización</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Mercancía</th>
                <th className="text-left">Origen</th>
                <th className="text-left">Destino</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Creada</th>
                <th className="text-right px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: any) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/ordenes/$id" params={{ id: o.id }} className="hover:underline text-primary">{o.numero}</Link>
                  </td>
                  <td className="text-xs text-muted-foreground">{o.cot_numero ?? "—"}</td>
                  <td>{o.clientes?.nombre ?? "—"}</td>
                  <td className="text-muted-foreground">{o.cot_tipo_mercancia ?? "—"}</td>
                  <td>{o.cot_origen ?? "—"}</td>
                  <td>{o.cot_destino ?? "—"}</td>
                  <td><Badge className={ORDEN_ESTADO_CLASS[o.estado] ?? ""}>{ordenEstadoLabel(o.estado)}</Badge></td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(o.created_at?.slice(0, 10))}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                        onClick={() => setToTrash({ id: o.id, numero: o.numero })} title="Mover a la papelera">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin órdenes.</td></tr>
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
              ¿Deseas mover la orden <strong>{toTrash?.numero}</strong> a la papelera?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}>
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
