/** Datos bancarios fijos de la empresa usados en la Solicitud de Reembolso de Gastos.
 *  Se guardan una sola vez en Administración → Configuración (tabla system_settings). */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const REEMBOLSO_BANCO_KEY = "reembolso_datos_bancarios";

export type DatosBancariosReembolso = {
  cuenta: string;
  tipo_cuenta: string;
  beneficiario: string;
  banco: string;
};

export const DATOS_BANCARIOS_VACIOS: DatosBancariosReembolso = {
  cuenta: "",
  tipo_cuenta: "",
  beneficiario: "",
  banco: "",
};

export function parseDatosBancarios(raw: string | null | undefined): DatosBancariosReembolso {
  if (!raw) return { ...DATOS_BANCARIOS_VACIOS };
  try {
    const parsed = JSON.parse(raw) as Partial<DatosBancariosReembolso>;
    return {
      cuenta: parsed.cuenta ?? "",
      tipo_cuenta: parsed.tipo_cuenta ?? "",
      beneficiario: parsed.beneficiario ?? "",
      banco: parsed.banco ?? "",
    };
  } catch {
    return { ...DATOS_BANCARIOS_VACIOS };
  }
}

export async function fetchDatosBancariosReembolso(): Promise<DatosBancariosReembolso> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", REEMBOLSO_BANCO_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseDatosBancarios(data?.value ?? null);
}

export function useDatosBancariosReembolso() {
  return useQuery({
    queryKey: ["system_settings", REEMBOLSO_BANCO_KEY],
    queryFn: fetchDatosBancariosReembolso,
    staleTime: 5 * 60_000,
  });
}
