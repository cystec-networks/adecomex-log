import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ship, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PortalVariant = "cliente" | "estudiante" | null;

function detectVariant(next: string | null): PortalVariant {
  if (!next) return null;
  if (next.startsWith("/portal-estudiante")) return "estudiante";
  if (next.startsWith("/portal")) return "cliente";
  return null;
}

function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  beforeLoad: async ({ search }) => {
    const next = safeNext(search.next);
    const isPortalCliente = next?.startsWith("/portal") && !next.startsWith("/portal-estudiante");
    const authClient = isPortalCliente ? supabasePortal : supabase;
    const { data } = await authClient.auth.getUser();
    if (data.user) {
      throw next ? redirect({ href: next }) : redirect({ to: "/" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next: nextRaw } = Route.useSearch();
  const next = safeNext(nextRaw);
  const variant = useMemo(() => detectVariant(next), [next]);
  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/" });
  };
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) goNext();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

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
    goNext();
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


  const portalTitle =
    variant === "cliente"
      ? "Portal de Clientes"
      : variant === "estudiante"
        ? "Portal de Estudiantes"
        : null;

  const heroTitle =
    variant === "cliente"
      ? "Consulta el estado de tus expedientes y gestiones aduanales en tiempo real."
      : variant === "estudiante"
        ? "Accede a tus programas, materiales y progreso académico."
        : "Gestión integral de importaciones y trámites aduanales.";

  const heroSubtitle =
    variant === "cliente"
      ? "Accede con tu cuenta de cliente para dar seguimiento a tus importaciones."
      : variant === "estudiante"
        ? "Accede con tu cuenta de estudiante para ver tus programas y materiales."
        : "Acceso restringido al personal interno autorizado por ADECOMEX SRL.";

  const cardTitle = portalTitle ?? "Acceso al sistema";
  const cardSubtitle =
    variant === "cliente"
      ? "Ingresa con tu cuenta de cliente"
      : variant === "estudiante"
        ? "Ingresa con tu cuenta de estudiante"
        : "Ingresa con tu cuenta corporativa";

  const forgotHint =
    variant === "cliente"
      ? "Ingresa tu correo de cliente."
      : variant === "estudiante"
        ? "Ingresa tu correo de estudiante."
        : "Ingresa tu correo corporativo.";

  const helpText =
    variant === "cliente"
      ? "¿No tienes acceso? Contacta a tu ejecutivo de cuenta en ADECOMEX SRL."
      : variant === "estudiante"
        ? "¿No tienes acceso? Contacta a la coordinación académica de ADECOMEX SRL."
        : "¿No tienes acceso? Solicítalo al administrador del sistema.";

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--primary-deep)] text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 grid place-items-center rounded-lg bg-accent text-accent-foreground">
            {variant === "estudiante" ? <GraduationCap className="h-6 w-6" /> : <Ship className="h-6 w-6" />}
          </div>
          <div>
            <div className="font-display font-bold text-xl leading-tight">ADECOMEX SRL</div>
            <div className="text-xs opacity-70">
              {variant === "cliente"
                ? "PORTAL DE CLIENTES"
                : variant === "estudiante"
                  ? "PORTAL DE ESTUDIANTES"
                  : "GESTION Y LOGISTICA"}
            </div>
          </div>
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">
            {heroTitle}
          </h1>
          <p className="mt-4 text-primary-foreground/70 max-w-md">
            {heroSubtitle}
          </p>
        </div>
        <div className="text-xs opacity-60">© {new Date().getFullYear()} ADECOMEX SRL</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">{cardTitle}</CardTitle>
            <CardDescription>{cardSubtitle}</CardDescription>
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
                {helpText}
              </p>
            </form>
          </CardContent>
        </Card>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restablecer contraseña</DialogTitle>
              <DialogDescription>
                {forgotHint} Si existe una cuenta, recibirás un enlace para definir una nueva contraseña.
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
