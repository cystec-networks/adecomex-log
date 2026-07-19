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

export const Route = createFileRoute("/_authenticated/academia/accesos-estudiantes")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id)
      .in("role", ["admin", "academia"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: AccesosEstudiantesPage,
});

type EstudianteRow = {
  id: string;
  nombre: string;
  cedula_pasaporte: string | null;
  email: string | null;
  telefono: string | null;
  vinculo: { user_id: string; activo: boolean } | null;
};

function AccesosEstudiantesPage() {
  const qc = useQueryClient();
  const [inviting, setInviting] = useState<EstudianteRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["accesos-estudiantes"],
    queryFn: async (): Promise<EstudianteRow[]> => {
      const [{ data: estudiantes, error: e1 }, { data: vinculos, error: e2 }] = await Promise.all([
        (supabase as any).from("estudiantes").select("id, nombre, cedula_pasaporte, email, telefono").order("nombre"),
        (supabase as any).from("estudiante_usuarios").select("user_id, estudiante_id, activo"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const byEst = new Map<string, { user_id: string; activo: boolean }>();
      for (const v of (vinculos ?? []) as any[]) byEst.set(v.estudiante_id, { user_id: v.user_id, activo: v.activo });
      return ((estudiantes ?? []) as any[]).map((e) => ({ ...e, vinculo: byEst.get(e.id) ?? null }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["accesos-estudiantes"] });

  const toggleAcceso = useMutation({
    mutationFn: async ({ user_id, activo }: { user_id: string; activo: boolean }) => {
      const { error } = await (supabase as any).from("estudiante_usuarios").update({ activo }).eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.activo ? "Acceso reactivado" : "Acceso revocado");
      refresh();
    },
    onError: (err: any) => toast.error(err.message ?? "No se pudo actualizar"),
  });

  const enviarWhatsApp = useMutation({
    mutationFn: async (e: EstudianteRow) => {
      const tel = normalizeWhatsAppPhone(e.telefono);
      if (!tel) throw new Error("Este estudiante no tiene teléfono registrado");
      const clean = (e.email ?? "").trim().toLowerCase();
      if (!clean) throw new Error("El estudiante no tiene email registrado para generar la invitación");
      const { data, error } = await (supabase as any).functions.invoke("invitar-estudiante-usuario", {
        body: { email: clean, estudiante_id: e.id, soloGenerarEnlace: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.yaConfirmado) return { yaConfirmado: true as const };
      const enlace: string | undefined = data?.enlace;
      if (!enlace) throw new Error(data?.warning ?? "No se pudo generar el enlace de invitación");
      const msg = `Hola ${e.nombre}, ADECOMEX Academia te invita a acceder a tu portal de estudiante. Activa tu acceso aquí: ${enlace}`;
      const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return { yaConfirmado: false as const, warning: data?.warning as string | null };
    },
    onSuccess: (res) => {
      if (res.yaConfirmado) {
        toast.info("Este estudiante ya tiene cuenta activa. Debe iniciar sesión desde la pantalla de login.");
      } else {
        if (res.warning) toast.warning(res.warning);
        else toast.success("Enlace generado y abierto en WhatsApp");
        refresh();
      }
    },
    onError: (err: any) => toast.error(err.message ?? "No se pudo generar el enlace"),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Accesos al portal de estudiantes</h1>
        <p className="text-sm text-muted-foreground">
          Invita, revoca o reactiva el acceso de solo lectura de los estudiantes al portal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{data?.length ?? 0} estudiantes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left">Cédula / Pasaporte</th>
                <th className="text-left">Email</th>
                <th className="text-left">Acceso al portal</th>
                <th className="text-right px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
              {(data ?? []).map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{e.nombre}</td>
                  <td className="text-muted-foreground">{e.cedula_pasaporte ?? "—"}</td>
                  <td className="text-muted-foreground">{e.email ?? "—"}</td>
                  <td>
                    {!e.vinculo && <Badge variant="outline">Sin acceso</Badge>}
                    {e.vinculo?.activo && <Badge className="bg-emerald-600 hover:bg-emerald-600">Vinculado</Badge>}
                    {e.vinculo && !e.vinculo.activo && <Badge variant="secondary">Desactivado</Badge>}
                  </td>
                  <td className="text-right px-4 py-2">
                    {!e.vinculo && (
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setInviting(e)}>
                          <UserPlus className="h-4 w-4 mr-1" /> Invitar al portal
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#128C7E]"
                          onClick={() => enviarWhatsApp.mutate(e)}
                          disabled={enviarWhatsApp.isPending}
                        >
                          <MessageCircle className="h-4 w-4 mr-1" /> Enviar enlace por WhatsApp
                        </Button>
                      </div>
                    )}
                    {e.vinculo && (
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setInviting(e)}>
                          <Mail className="h-4 w-4 mr-1" /> Reenviar invitación
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#128C7E]"
                          onClick={() => enviarWhatsApp.mutate(e)}
                          disabled={enviarWhatsApp.isPending}
                        >
                          <MessageCircle className="h-4 w-4 mr-1" /> Enviar enlace por WhatsApp
                        </Button>
                        {e.vinculo.activo ? (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => toggleAcceso.mutate({ user_id: e.vinculo!.user_id, activo: false })}
                            disabled={toggleAcceso.isPending}
                          >
                            <ShieldOff className="h-4 w-4 mr-1" /> Revocar acceso
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => toggleAcceso.mutate({ user_id: e.vinculo!.user_id, activo: true })}
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin estudiantes.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <InvitarDialog estudiante={inviting} onClose={() => setInviting(null)} onDone={refresh} />
    </div>
  );
}

function InvitarDialog({
  estudiante, onClose, onDone,
}: { estudiante: EstudianteRow | null; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const open = !!estudiante;
  useEffect(() => {
    if (estudiante) setEmail(estudiante.email ?? "");
  }, [estudiante]);

  const handleClose = () => {
    setEmail("");
    onClose();
  };

  const invitar = async () => {
    if (!estudiante) return;
    const clean = email.trim().toLowerCase();
    if (!clean) { toast.error("Ingresa el email del estudiante"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invitar-estudiante-usuario", {
        body: { email: clean, estudiante_id: estudiante.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.yaConfirmado) {
        toast.info("Este estudiante ya tiene cuenta activa, no se reenvió invitación");
      } else if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success(estudiante.vinculo ? "Invitación reenviada" : "Invitación enviada al portal");
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
            Se enviará una invitación por email al estudiante <strong>{estudiante?.nombre}</strong> para acceder al portal en modo solo lectura.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="email">Email del estudiante</Label>
          <Input
            id="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="estudiante@ejemplo.com"
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
