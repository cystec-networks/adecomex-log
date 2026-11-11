import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMyRoles } from "@/lib/auth-hooks";
import { normalizarPatronRemitente } from "@/lib/correo-expediente";

/** Catálogo «Remitentes ignorados»: sus correos se descartan sin crear solicitud ni tocar Expedientes. */
export function RemitentesIgnorados() {
  const qc = useQueryClient();
  const { data: roles = [] } = useMyRoles();
  const esAdmin = roles.includes("admin" as any);
  const [patron, setPatron] = useState("");
  const [motivo, setMotivo] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["remitentes-ignorados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("remitentes_ignorados").select("id,patron,motivo,activo").order("patron");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ["remitentes-ignorados"] });
  const agregar = useMutation({
    mutationFn: async () => {
      const p = normalizarPatronRemitente(patron);
      if (!p) throw new Error("Escribe un dominio (ej. banco.com.do) o una dirección completa.");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("remitentes_ignorados").insert({ patron: p, motivo: motivo.trim() || null, created_by: u.user?.id ?? null });
      if (error) throw new Error(error.code === "23505" ? `${p} ya está en el catálogo.` : error.message);
      return p;
    },
    onSuccess: (p) => { toast.success(`Se ignorarán los correos de ${p}.`); setPatron(""); setMotivo(""); refrescar(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cambiar = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from("remitentes_ignorados").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  });
  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("remitentes_ignorados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Remitente eliminado del catálogo."); refrescar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8"><Ban className="h-3.5 w-3.5 mr-1" />Remitentes ignorados</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Remitentes ignorados</DialogTitle>
          <DialogDescription className="text-[12px]">Los correos de estos dominios o direcciones nunca crean solicitud ni se agregan a un Expediente. Quedan en el Registro como descartados.</DialogDescription>
        </DialogHeader>
        {esAdmin ? (
          <form className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); agregar.mutate(); }}>
            <Input value={patron} onChange={(e) => setPatron(e.target.value)} placeholder="banco.com.do o persona@dominio.com" aria-label="Dominio o dirección" className="text-[13px] min-w-0" />
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo" className="text-[13px] min-w-0" />
            <Button type="submit" size="sm" className="h-9" disabled={agregar.isPending || !patron.trim()}>
              {agregar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Agregar
            </Button>
          </form>
        ) : <p className="text-[12px] text-muted-foreground">Solo un administrador puede modificar el catálogo.</p>}
        <div className="max-h-[50vh] overflow-auto border rounded-md divide-y">
          {isLoading ? <p className="p-3 text-[12px] text-muted-foreground">Cargando…</p> : data.length === 0 ? <p className="p-3 text-[12px] text-muted-foreground">Sin remitentes ignorados.</p> : data.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-mono truncate" title={r.patron}>{r.patron}</div>
                {r.motivo && <div className="text-[11px] text-muted-foreground truncate" title={r.motivo}>{r.motivo}</div>}
              </div>
              <Switch checked={r.activo} disabled={!esAdmin || cambiar.isPending} onCheckedChange={(activo) => cambiar.mutate({ id: r.id, activo })} aria-label={`Ignorar ${r.patron}`} />
              {esAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Eliminar" disabled={eliminar.isPending}
                  onClick={() => { if (confirm(`¿Dejar de ignorar los correos de ${r.patron}?`)) eliminar.mutate(r.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
