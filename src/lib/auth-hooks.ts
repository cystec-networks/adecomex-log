import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export type AppRole =
  | "admin"
  | "operaciones"
  | "ejecutivo"
  | "agente_aduanal"
  | "documentacion"
  | "transporte"
  | "finanzas";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export function useMyRoles() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useMyProfile() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  operaciones: "Operaciones",
  ejecutivo: "Ejecutivo",
  agente_aduanal: "Agente Aduanal",
  documentacion: "Documentación",
  transporte: "Transporte",
  finanzas: "Finanzas",
};
