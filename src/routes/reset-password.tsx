import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Ship } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase emite un evento PASSWORD_RECOVERY cuando el usuario llega desde el enlace del correo.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // También verificar si ya hay sesión de recuperación al montar
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Mínimo 8 caracteres");
    if (pwd !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada. Inicia sesión.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
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
          <CardTitle className="font-display text-xl">Restablecer contraseña</CardTitle>
          <CardDescription>
            {ready
              ? "Define una nueva contraseña para tu cuenta."
              : "Valida tu enlace de recuperación. Si llegaste desde el correo y no carga, vuelve a solicitar el restablecimiento."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} disabled={!ready} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar contraseña</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={!ready || loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Actualizar contraseña
            </Button>
            <button type="button" className="w-full text-xs text-muted-foreground hover:underline" onClick={() => navigate({ to: "/auth" })}>
              Volver al inicio de sesión
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
