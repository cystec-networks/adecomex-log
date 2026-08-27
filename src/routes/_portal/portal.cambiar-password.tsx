import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabasePortal as supabase } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Ship } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_portal/portal/cambiar-password")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: CambiarPasswordCliente,
});

function CambiarPasswordCliente() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Mínimo 8 caracteres");
    if (pwd !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) { setLoading(false); return toast.error(error.message); }
    const { error: rpcErr } = await (supabase as any).rpc("marcar_password_cambiada_cliente");
    setLoading(false);
    if (rpcErr) return toast.error(rpcErr.message);
    toast.success("Contraseña actualizada");
    navigate({ to: "/portal", replace: true });
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-[var(--primary-deep)] text-primary-foreground">
              <Ship className="h-5 w-5" />
            </div>
            <div className="font-display font-bold">ADECOMEX SRL</div>
          </div>
          <CardTitle className="font-display text-xl">Define tu nueva contraseña</CardTitle>
          <CardDescription>
            Por seguridad, debes cambiar la contraseña temporal antes de continuar al portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar contraseña</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar y entrar al portal
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
