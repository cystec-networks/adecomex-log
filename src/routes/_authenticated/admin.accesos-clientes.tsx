import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, ShieldOff, ShieldCheck, Mail, MessageCircle } from "lucide-react";
import { normalizeWhatsAppPhone } from "@/components/whatsapp-button";

export const Route = createFileRoute("/_authenticated/admin/accesos-clientes")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: AccesosClientesPage,
});

type ClienteRow = {
  id: string;
  nombre: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  vinculo: { user_id: string; activo: boolean } | null;
};

function AccesosClientesPage() {
  const qc = useQueryClient();
  const [inviting, setInviting] = useState<ClienteRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["accesos-clientes"],
    queryFn: async (): Promise<ClienteRow[]> => {
      const [{ data: clientes, error: e1 }, { data: vinculos, error: e2 }] = await Promise.all([
        supabase.from("clientes").select("id, nombre, rnc, email").order("nombre"),
        supabase.from("cliente_usuarios").select("user_id, cliente_id, activo"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const byCliente = new Map<string, { user_id: string; activo: boolean }>();
      for (const v of vinculos ?? []) byCliente.set(v.cliente_id, { user_id: v.user_id, activo: v.activo });
      return (clientes ?? []).map((c) => ({ ...c, vinculo: byCliente.get(c.id) ?? null }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["accesos-clientes"] });

  const toggleAcceso = useMutation({
    mutationFn: async ({ user_id, activo }: { user_id: string; activo: boolean }) => {
      const { error } = await supabase.from("cliente_usuarios").update({ activo }).eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.activo ? "Acceso reactivado" : "Acceso revocado");
      refresh();
    },
    onError: (err: any) => toast.error(err.message ?? "No se pudo actualizar"),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Accesos al portal de clientes</h1>
        <p className="text-sm text-muted-foreground">
          Invita, revoca o reactiva el acceso de solo lectura de los clientes al portal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{data?.length ?? 0} clientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left">RNC</th>
                <th className="text-left">Email</th>
                <th className="text-left">Acceso al portal</th>
                <th className="text-right px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
              {(data ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{c.nombre}</td>
                  <td className="text-muted-foreground">{c.rnc ?? "—"}</td>
                  <td className="text-muted-foreground">{c.email ?? "—"}</td>
                  <td>
                    {!c.vinculo && <Badge variant="outline">Sin acceso</Badge>}
                    {c.vinculo?.activo && <Badge className="bg-emerald-600 hover:bg-emerald-600">Vinculado</Badge>}
                    {c.vinculo && !c.vinculo.activo && <Badge variant="secondary">Desactivado</Badge>}
                  </td>
                  <td className="text-right px-4 py-2">
                    {!c.vinculo && (
                      <Button size="sm" variant="outline" onClick={() => setInviting(c)}>
                        <UserPlus className="h-4 w-4 mr-1" /> Invitar al portal
                      </Button>
                    )}
                    {c.vinculo && (
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setInviting(c)}>
                          <Mail className="h-4 w-4 mr-1" /> Reenviar invitación
                        </Button>
                        {c.vinculo.activo ? (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => toggleAcceso.mutate({ user_id: c.vinculo!.user_id, activo: false })}
                            disabled={toggleAcceso.isPending}
                          >
                            <ShieldOff className="h-4 w-4 mr-1" /> Revocar acceso
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => toggleAcceso.mutate({ user_id: c.vinculo!.user_id, activo: true })}
                            disabled={toggleAcceso.isPending}
                          >
                            <ShieldCheck className="h-4 w-4 mr-1" /> Reactivar
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin clientes.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <InvitarDialog cliente={inviting} onClose={() => setInviting(null)} onDone={refresh} />
    </div>
  );
}

function InvitarDialog({
  cliente, onClose, onDone,
}: { cliente: ClienteRow | null; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const open = !!cliente;
  useEffect(() => {
    if (cliente) setEmail(cliente.email ?? "");
  }, [cliente]);


  const handleClose = () => {
    setEmail("");
    onClose();
  };

  const invitar = async () => {
    if (!cliente) return;
    const clean = email.trim().toLowerCase();
    if (!clean) { toast.error("Ingresa el email de contacto"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invitar-cliente-usuario", {
        body: { email: clean, cliente_id: cliente.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.yaConfirmado) {
        toast.info("Este cliente ya tiene cuenta activa, no se reenvió invitación");
      } else if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success(cliente.vinculo ? "Invitación reenviada" : "Invitación enviada al portal");
      }
      onDone();
      handleClose();
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo enviar la invitación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar al portal</DialogTitle>
          <DialogDescription>
            Se enviará una invitación por email al contacto del cliente <strong>{cliente?.nombre}</strong> para acceder al portal en modo solo lectura.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="email">Email de contacto</Label>
          <Input
            id="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@ejemplo.com"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancelar</Button>
          <Button onClick={invitar} disabled={loading}>
            {loading ? "Enviando…" : "Enviar invitación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
