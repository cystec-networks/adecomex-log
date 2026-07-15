import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });

    const userId = data.user.id;

    // Staff: cualquier rol asignado → panel interno
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1);
    if (roles && roles.length > 0) throw redirect({ to: "/dashboard" });

    // Cliente vinculado y activo → portal
    const { data: link } = await supabase
      .from("cliente_usuarios")
      .select("cliente_id")
      .eq("user_id", userId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    if (link) throw redirect({ to: "/portal" });

    // Sesión huérfana
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
