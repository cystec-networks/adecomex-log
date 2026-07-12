import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const GMAIL_AUTHUSER_KEY = "gmail_operaciones_authuser";
export const GMAIL_AUTHUSER_DEFAULT = "1";

export type SystemSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

export function useSystemSetting(key: string, fallback = "") {
  return useQuery({
    queryKey: ["system_settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key,value,description,updated_at")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data as SystemSetting | null) ?? { key, value: fallback, description: null, updated_at: "" };
    },
    staleTime: 5 * 60_000,
  });
}

export function useGmailAuthuser() {
  const q = useSystemSetting(GMAIL_AUTHUSER_KEY, GMAIL_AUTHUSER_DEFAULT);
  const raw = q.data?.value ?? GMAIL_AUTHUSER_DEFAULT;
  const n = Number.parseInt(raw, 10);
  const authuser = Number.isFinite(n) && n >= 0 ? String(n) : GMAIL_AUTHUSER_DEFAULT;
  return { authuser, query: q };
}
