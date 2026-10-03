// Plazo (días hábiles) para presentar la declaración, configurado por Régimen
// en catalogo_regimenes.dias_habiles_presentar, con override opcional por expediente.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate } from "@/lib/dates";

export type PlazoRegimen = { codigo: string; nombre: string; dias: number | null };

export function usePlazosRegimen() {
  return useQuery({
    queryKey: ["plazos-regimen"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("catalogo_regimenes").select("codigo,nombre,dias_habiles_presentar");
      return (data ?? []).map((r: any) => ({ codigo: r.codigo, nombre: r.nombre, dias: r.dias_habiles_presentar })) as PlazoRegimen[];
    },
  });
}

const n = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Días configurados para el régimen (por nombre o código), o null si no hay. */
export function diasRegimen(regimen: string | null | undefined, plazos: PlazoRegimen[] | undefined): number | null {
  if (!regimen || !plazos) return null;
  const r = n(regimen);
  const hit = plazos.find((p) => n(p.nombre) === r || n(p.codigo) === r || r.startsWith(n(p.codigo) + " "));
  return hit?.dias && hit.dias > 0 ? hit.dias : null;
}

export function plazoEfectivo(
  exp: { regimen_aduanero?: string | null; plazo_presentar_override?: number | null },
  plazos: PlazoRegimen[] | undefined,
): { dias: number | null; esOverride: boolean } {
  const ov = exp.plazo_presentar_override;
  if (typeof ov === "number" && ov > 0) return { dias: ov, esOverride: true };
  return { dias: diasRegimen(exp.regimen_aduanero, plazos), esOverride: false };
}

const habil = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

/** Fecha de vencimiento: N días hábiles contando desde la llegada (inclusive). */
export function venceEn(llegada: string, dias: number): Date | null {
  const d = parseLocalDate(llegada);
  if (!d || isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(d);
  while (true) {
    if (habil(cur)) count++;
    if (count >= dias) return cur;
    cur.setDate(cur.getDate() + 1);
  }
}

/** Días hábiles restantes desde hoy (excluido) hasta el vencimiento (incluido). Negativo si venció. */
export function habilesRestantes(vence: Date): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (vence.getTime() === hoy.getTime()) return 0;
  const sign = vence > hoy ? 1 : -1;
  const [a, b] = sign > 0 ? [hoy, vence] : [vence, hoy];
  let c = 0;
  const cur = new Date(a); cur.setDate(cur.getDate() + 1);
  while (cur <= b) { if (habil(cur)) c++; cur.setDate(cur.getDate() + 1); }
  return sign * c;
}
