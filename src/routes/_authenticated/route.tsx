import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Segunda barrera: usuarios sin rol de staff no pertenecen aquí
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .limit(1);
    if (!roles || roles.length === 0) {
      // Prioridad: cliente > estudiante
      const { data: cli } = await supabase
        .from("cliente_usuarios")
        .select("cliente_id")
        .eq("user_id", data.user.id)
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (cli) throw redirect({ to: "/portal" });
      const { data: est } = await (supabase as any)
        .from("estudiante_usuarios")
        .select("estudiante_id")
        .eq("user_id", data.user.id)
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (est) throw redirect({ to: "/portal-estudiante" });
      throw redirect({ to: "/auth" });
    }



    // Enforce 8h session lifetime from login time
    try {
      const loginAtStr = localStorage.getItem("adecomex.loginAt");
      const loginAt = loginAtStr ? parseInt(loginAtStr, 10) : 0;
      if (!loginAt) {
        // Backfill for existing sessions so we don't kick immediately
        localStorage.setItem("adecomex.loginAt", String(Date.now()));
      } else if (Date.now() - loginAt > EIGHT_HOURS_MS) {
        await supabase.auth.signOut();
        localStorage.removeItem("adecomex.loginAt");
        throw redirect({ to: "/auth" });
      }
    } catch (e: any) {
      if (e?.isRedirect) throw e;
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
