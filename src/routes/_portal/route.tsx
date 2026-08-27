import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LogOut, Ship } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/logo-adecomex.jpg.asset.json";

export const Route = createFileRoute("/_portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const userId = data.user.id;

    // Staff → redirigir al dashboard interno
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1);
    if (roles && roles.length > 0) {
      throw redirect({ to: "/dashboard" });
    }

    // Cliente activo requerido
    const { data: link } = await (supabase as any)
      .from("cliente_usuarios")
      .select("cliente_id, activo, debe_cambiar_password")
      .eq("user_id", userId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!link) {
      await supabase.auth.signOut();
      toast.error("Tu cuenta no tiene acceso a este portal");
      throw redirect({ to: "/auth" });
    }

    if (link.debe_cambiar_password
        && !location.pathname.endsWith("/portal/cambiar-password")) {
      throw redirect({ to: "/portal/cambiar-password" });
    }

    return { user: data.user, clienteId: link.cliente_id as string };
  },
  component: PortalLayout,
});

function PortalLayout() {
  const { clienteId } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: cliente } = useQuery({
    queryKey: ["portal-cliente", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("nombre, rnc")
        .eq("id", clienteId)
        .maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto h-full px-4 flex items-center gap-3">
          <Link to="/portal" className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 rounded-md bg-white overflow-hidden grid place-items-center shrink-0">
              <img src={logoAsset.url} alt="ADECOMEX SRL" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold leading-tight">ADECOMEX SRL</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Portal de clientes</div>
            </div>
          </Link>
          <div className="flex-1" />
          {cliente && (
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium truncate max-w-[240px]">{cliente.nombre}</div>
              {cliente.rnc && <div className="text-xs text-muted-foreground">RNC {cliente.rnc}</div>}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Salir
          </Button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-muted-foreground flex items-center gap-1">
        <Ship className="h-3 w-3" /> ADECOMEX SRL · Portal de solo lectura
      </footer>
    </div>
  );
}
