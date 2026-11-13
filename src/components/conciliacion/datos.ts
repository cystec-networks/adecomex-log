import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CuentaBeneficiario, EntradaDiario, ReglaBanco } from "@/lib/conciliacion-diario";

export type EntradaDiarioFila = EntradaDiario & { movimiento_id: string | null; retroactiva?: boolean | null };
export type ReglaFila = ReglaBanco & { id: string };
export type CuentaFila = CuentaBeneficiario & { id: string; tipo: string; origen: string; notas: string | null };

export const fmtRD = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n || 0);

export function useEntradasDiario() {
  return useQuery({
    queryKey: ["conciliacion-entradas-diario"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vista_registro_diario")
        .select("id, origen_tipo, fecha, secuencia, categoria, referencia, beneficiario, concepto, neto, conciliado, origen, estado, movimiento_id, retroactiva")
        .order("fecha", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, neto: Number(r.neto) })) as unknown as EntradaDiarioFila[];
    },
  });
}

export function useReglasBanco() {
  return useQuery({
    queryKey: ["banco-reglas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banco_reglas").select("*").order("orden").order("palabra_clave");
      if (error) throw error;
      return (data ?? []) as unknown as ReglaFila[];
    },
  });
}

export function useCuentasBeneficiario() {
  return useQuery({
    queryKey: ["banco-cuentas-beneficiario"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banco_cuentas_beneficiario").select("*").order("beneficiario");
      if (error) throw error;
      return (data ?? []) as unknown as CuentaFila[];
    },
  });
}

/** Refresca movimientos, Diario y catálogos tras cualquier conciliación. */
export function useInvalidarConciliacion() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["banco_movimientos"] });
    qc.invalidateQueries({ queryKey: ["conciliacion-entradas-diario"] });
    qc.invalidateQueries({ queryKey: ["banco-cuentas-beneficiario"] });
    qc.invalidateQueries({ queryKey: ["registro-diario"] });
    qc.invalidateQueries({ queryKey: ["solicitudes-pago-transferencia"] });
    qc.invalidateQueries({ queryKey: ["siguiente-tf"] });
    qc.invalidateQueries({ queryKey: ["previsualizar-tf"] });
    qc.invalidateQueries({ queryKey: ["tf-sin-uso"] });
  };
}

export function useConciliarDiario(onDone?: () => void) {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: async (p: { movimientoId: string; entradas: Pick<EntradaDiario, "origen_tipo" | "id">[]; motivo?: string | null }) => {
      const { data, error } = await supabase.rpc("conciliar_movimiento_diario", {
        p_movimiento: p.movimientoId,
        p_entradas: p.entradas.map((e) => ({ origen_tipo: e.origen_tipo, solicitud_id: e.id })),
        p_motivo: p.motivo ?? undefined,
      });
      if (error) throw error;
      return data as { secuencias: string; diferencia: number };
    },
    onSuccess: (r) => {
      toast.success(`Conciliado con ${r.secuencias}`);
      invalidar();
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarcarMovimiento(onDone?: () => void) {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: async (p: { movimientoId: string; tipo: "ignorado" | "comision"; motivo?: string; vinculado?: string }) => {
      const { error } = await supabase.rpc("marcar_movimiento_banco", {
        p_movimiento: p.movimientoId,
        p_tipo: p.tipo,
        p_motivo: p.motivo ?? undefined,
        p_vinculado: p.vinculado ?? undefined,
      });
      if (error) throw error;
      return p.tipo;
    },
    onSuccess: (tipo) => {
      toast.success(tipo === "ignorado" ? "Movimiento marcado como «No aplica»" : "Comisión vinculada con su pago");
      invalidar();
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
