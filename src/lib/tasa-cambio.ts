import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtLocalDate } from "@/lib/dates";

export type TasaCambioRow = {
  id: string;
  fecha: string; // YYYY-MM-DD
  tasa: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

/** Fecha (YYYY-MM-DD) que rige la tasa: usa created_at del expediente. */
export function fechaTasa(exp: { created_at?: string | null }): string {
  const iso = exp.created_at ?? new Date().toISOString();
  return iso.slice(0, 10);
}

/** Un expediente "congela" su tasa cuando ya fue despachado o tiene resultado oficial DGA. */
export function debeCongelar(exp: {
  estado?: string | null;
  liq_oficial_total?: number | string | null;
  tasa_cambio_congelada?: boolean | null;
}): boolean {
  if (exp.tasa_cambio_congelada) return true;
  const estado = (exp.estado ?? "").toString().toLowerCase();
  if (estado === "despachado") return true;
  const oficial = exp.liq_oficial_total;
  if (oficial != null && oficial !== "" && Number(oficial) > 0) return true;
  return false;
}

export function useTasaCambioForExpediente(exp: any) {
  const qc = useQueryClient();
  const fecha = fechaTasa(exp);
  const congelado = debeCongelar(exp);
  const tasaCongelada = exp.tasa_cambio_usada != null ? Number(exp.tasa_cambio_usada) : null;

  const q = useQuery({
    queryKey: ["catalogo_tasas_cambio", fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_tasas_cambio")
        .select("*")
        .eq("fecha", fecha)
        .maybeSingle();
      if (error) throw error;
      return (data as TasaCambioRow | null) ?? null;
    },
    enabled: !congelado || tasaCongelada == null,
    staleTime: 60_000,
  });

  const tasaCatalogo = q.data?.tasa != null ? Number(q.data.tasa) : null;

  // Tasa efectiva a usar
  let tasa: number | null;
  let origen: "congelada" | "catalogo" | null;
  if (congelado && tasaCongelada != null) {
    tasa = tasaCongelada;
    origen = "congelada";
  } else if (tasaCatalogo != null) {
    tasa = tasaCatalogo;
    origen = "catalogo";
  } else if (tasaCongelada != null) {
    // fallback: catálogo aún no cargado pero teníamos guardada
    tasa = tasaCongelada;
    origen = "congelada";
  } else {
    tasa = null;
    origen = null;
  }

  // Persistir tasa_cambio_usada en expediente activo si difiere de la del catálogo.
  useEffect(() => {
    if (congelado) return;
    if (tasaCatalogo == null) return;
    if (tasaCongelada != null && Math.abs(tasaCongelada - tasaCatalogo) < 0.00005) return;
    supabase
      .from("expedientes")
      .update({ tasa_cambio_usada: tasaCatalogo })
      .eq("id", exp.id)
      .then(() => qc.invalidateQueries({ queryKey: ["expediente", exp.id] }));
  }, [congelado, tasaCatalogo, tasaCongelada, exp.id, qc]);

  const guardar = useMutation({
    mutationFn: async (valor: number) => {
      const { data, error } = await supabase
        .from("catalogo_tasas_cambio")
        .insert({ fecha, tasa: valor })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      await supabase.from("expedientes").update({ tasa_cambio_usada: valor }).eq("id", exp.id);
      return data as TasaCambioRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogo_tasas_cambio", fecha] });
      qc.invalidateQueries({ queryKey: ["catalogo_tasas_cambio"] });
      qc.invalidateQueries({ queryKey: ["expediente", exp.id] });
    },
  });

  return {
    fecha,
    fechaLabel: fmtLocalDate(fecha),
    tasa,
    origen,
    congelado,
    needsCapture: tasa == null && !q.isLoading,
    loading: q.isLoading,
    guardar,
  };
}
