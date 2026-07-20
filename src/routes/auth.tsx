import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ship, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = /invalid/i.test(error.message)
        ? "Credenciales inválidas. Verifica tu correo y contraseña."
        : error.message;
      return toast.error(msg);
    }
    try {
      localStorage.setItem("adecomex.loginAt", String(Date.now()));
    } catch {}
    toast.success("Sesión iniciada");
    navigate({ to: "/" });
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Si el correo existe, recibirás un enlace para restablecer tu contraseña.");
    setForgotOpen(false);
    setForgotEmail("");
  };


  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--primary-deep)] text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 grid place-items-center rounded-lg bg-accent text-accent-foreground">
            <Ship className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display font-bold text-xl leading-tight">ADECOMEX SRL</div>
            <div className="text-xs opacity-70">GESTION Y LOGISTICA</div>
          </div>
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">
            Gestión integral de importaciones y trámites aduanales.
          </h1>
          <p className="mt-4 text-primary-foreground/70 max-w-md">
            Acceso restringido al personal interno autorizado por ADECOMEX SRL.
          </p>
        </div>
        <div className="text-xs opacity-60">© {new Date().getFullYear()} ADECOMEX SRL</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Acceso al sistema</CardTitle>
            <CardDescription>Ingresa con tu cuenta corporativa</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                    className="text-xs text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Entrar
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                ¿No tienes acceso? Solicítalo al administrador del sistema.
              </p>
            </form>
          </CardContent>
        </Card>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restablecer contraseña</DialogTitle>
              <DialogDescription>
                Ingresa tu correo corporativo. Si existe una cuenta, recibirás un enlace para definir una nueva contraseña.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleForgot} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Correo</Label>
                <Input id="forgot-email" type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={forgotLoading || !forgotEmail}>
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Enviar enlace
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
