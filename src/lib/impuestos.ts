import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// --- Utilidades de cálculo de impuestos por línea ---
export type TaxCalc = {
  cifLinea: number;
  gravamen: number;
  selectivo: number;
  itbis: number;
  total: number;
};

export function calcImpuestosLinea(
  fobLinea: number,
  totalFob: number,
  seguro: number,
  flete: number,
  otros: number,
  pctGravamen: number | null | undefined,
  aplicaIsc: boolean | null | undefined,
  pctIsc: number | null | undefined,
  pctItbis: number | null | undefined,
  suspendido = false,
): TaxCalc {
  const share = totalFob > 0 ? fobLinea / totalFob : 0;
  const cifLinea = fobLinea + (seguro + flete + otros) * share;
  if (suspendido) return { cifLinea, gravamen: 0, selectivo: 0, itbis: 0, total: 0 };
  const grav = pctGravamen != null ? cifLinea * (Number(pctGravamen) / 100) : 0;
  const isc = aplicaIsc && pctIsc != null ? (cifLinea + grav) * (Number(pctIsc) / 100) : 0;
  const pIt = pctItbis != null ? Number(pctItbis) : 18;
  const itbis = pctItbis != null || pctGravamen != null ? (cifLinea + grav + isc) * (pIt / 100) : 0;
  const total = grav + isc + itbis;
  return { cifLinea, gravamen: grav, selectivo: isc, itbis, total };
}

// --- Régimen suspensivo de impuestos (ej. Zona Franca) ---

export type EstadoSuspensivo = { suspensivo: boolean; override: boolean; suspendido: boolean };
export const ImpuestosSuspCtx = createContext<EstadoSuspensivo>({ suspensivo: false, override: false, suspendido: false });
export const useImpuestosSusp = () => useContext(ImpuestosSuspCtx);

export async function esRegimenSuspensivo(nombre: string | null | undefined): Promise<boolean> {
  const n = (nombre ?? "").trim();
  if (!n) return false;
  const { data } = await supabase.from("catalogo_regimenes").select("suspensivo_impuestos").eq("nombre", n);
  return (data ?? []).some((r: any) => r.suspensivo_impuestos);
}

export function useEstadoSuspensivo(regimen: string | null | undefined, override: boolean | null | undefined): EstadoSuspensivo {
  const { data: suspensivo = false } = useQuery({
    queryKey: ["regimen-suspensivo", regimen ?? ""],
    queryFn: () => esRegimenSuspensivo(regimen),
  });
  const ov = !!override;
  return { suspensivo, override: ov, suspendido: suspensivo && !ov };
}
