import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useMyRoles, ROLE_LABELS } from "@/lib/auth-hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mi-cuenta")({
  ssr: false,
  component: MiCuenta,
});

function MiCuenta() {
  const { data: profile } = useMyProfile();
  const { data: roles } = useMyRoles();

  const [current, setCurrent] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("La nueva contraseña debe tener al menos 8 caracteres");
    if (pwd !== confirm) return toast.error("Las contraseñas no coinciden");
    if (!profile?.email) return toast.error("No se pudo determinar tu correo");

    setLoading(true);
    // Verificar contraseña actual re-autenticando
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: current,
    });
    if (signErr) {
      setLoading(false);
      return toast.error("La contraseña actual es incorrecta");
    }

    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);

    toast.success("Contraseña actualizada correctamente");
    setCurrent(""); setPwd(""); setConfirm("");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">Administra tus datos de acceso al sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Nombre: </span><b>{profile?.nombre ?? "—"}</b></div>
          <div><span className="text-muted-foreground">Correo: </span>{profile?.email ?? "—"}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Roles:</span>
            {(roles ?? []).map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>)}
            {(!roles || roles.length === 0) && <span className="text-muted-foreground">Sin roles</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Cambiar contraseña</CardTitle>
          <CardDescription>Ingresa tu contraseña actual y define una nueva de al menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Contraseña actual</Label>
              <Input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nueva contraseña</Label>
              <Input type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar nueva contraseña</Label>
              <Input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
                {show ? <><EyeOff className="h-4 w-4 mr-1" /> Ocultar</> : <><Eye className="h-4 w-4 mr-1" /> Mostrar</>}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
