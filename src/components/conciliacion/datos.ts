import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  inicioDiario, itemsRpcAutomatico, planConciliacionAutomatica,
  type CuentaBeneficiario, type DetalleLoteAutomatico, type EntradaDiario, type MovimientoBanco, type PlanAutomatico, type ReglaBanco,
} from "@/lib/conciliacion-diario";

export type EntradaDiarioFila = EntradaDiario & { movimiento_id: string | null; retroactiva?: boolean | null };
export type ReglaFila = ReglaBanco & { id: string };
export type CuentaFila = CuentaBeneficiario & { id: string; tipo: string; origen: string; notas: string | null };

export const fmtRD = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n || 0);

export async function leerEntradasDiario() {
  const { data, error } = await supabase
    .from("vista_registro_diario")
    .select("id, origen_tipo, fecha, secuencia, categoria, referencia, beneficiario, concepto, neto, conciliado, origen, estado, movimiento_id, retroactiva")
    .order("fecha", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, neto: Number(r.neto) })) as unknown as EntradaDiarioFila[];
}

export async function leerReglasBanco() {
  const { data, error } = await supabase.from("banco_reglas").select("*").order("orden").order("palabra_clave");
  if (error) throw error;
  return (data ?? []) as unknown as ReglaFila[];
}

export async function leerCuentasBeneficiario() {
  const { data, error } = await supabase.from("banco_cuentas_beneficiario").select("*").order("beneficiario");
  if (error) throw error;
  return (data ?? []) as unknown as CuentaFila[];
}

export function useEntradasDiario() {
  return useQuery({ queryKey: ["conciliacion-entradas-diario"], queryFn: leerEntradasDiario });
}

export function useReglasBanco() {
  return useQuery({ queryKey: ["banco-reglas"], queryFn: leerReglasBanco });
}

export function useCuentasBeneficiario() {
  return useQuery({ queryKey: ["banco-cuentas-beneficiario"], queryFn: leerCuentasBeneficiario });
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
    qc.invalidateQueries({ queryKey: ["banco-lotes-automaticos"] });
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

/** Movimientos del banco (todos) para planificar la conciliación automática con datos frescos. */
export async function leerMovimientosBanco(): Promise<MovimientoBanco[]> {
  const out: MovimientoBanco[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("banco_movimientos")
      .select("id, fecha, monto, tipo, descripcion, referencia, conciliado")
      .order("fecha").order("created_at").order("id")
      .range(desde, desde + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as MovimientoBanco[]).map((m) => ({ ...m, monto: Number(m.monto) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type DetalleAutomaticoFila = DetalleLoteAutomatico & {
  fecha?: string | null;
  beneficiario?: string | null;
  categoria?: string | null;
  pago?: string | null;
  fuente_tf?: string | null;
};

export type ResultadoRpcAutomatico = {
  lote: string | null;
  conciliados: number;
  creadas: number;
  no_aplica: number;
  comisiones: number;
  revision: number;
  total: number;
  detalle: DetalleAutomaticoFila[];
  simulado?: boolean;
};

/** Planifica con datos frescos y ejecuta (o simula, sin guardar nada) la conciliación automática.
 * `elegir` decide qué débitos pendientes se evalúan (los recién importados o los del rango de fechas). */
export async function ejecutarConciliacionAutomatica(opts: {
  elegir: (pendientes: MovimientoBanco[]) => MovimientoBanco[];
  archivo: string;
  origen: "importacion" | "pendientes";
  simular?: boolean;
  previsto?: DetalleAutomaticoFila[] | null;
}): Promise<{ resultado: ResultadoRpcAutomatico | null; plan: PlanAutomatico<MovimientoBanco>; evaluados: number }> {
  const [todos, entradas, cuentas, reglas] = await Promise.all([
    leerMovimientosBanco(), leerEntradasDiario(), leerCuentasBeneficiario(), leerReglasBanco(),
  ]);
  const pendientes = todos.filter((m) => m.tipo === "debito" && !m.conciliado);
  const elegidos = opts.elegir(pendientes);
  const plan = planConciliacionAutomatica(elegidos, todos, entradas, cuentas, reglas, inicioDiario(entradas));
  if (plan.acciones.length + plan.revision.length === 0) return { resultado: null, plan, evaluados: elegidos.length };
  const { data, error } = await supabase.rpc("conciliar_automatico_importacion", {
    ...itemsRpcAutomatico(plan),
    p_archivo: opts.archivo,
    p_simular: !!opts.simular,
    p_origen: opts.origen,
    p_previsto: (opts.previsto ?? undefined) as never,
  } as never);
  if (error) throw error;
  return { resultado: data as unknown as ResultadoRpcAutomatico, plan, evaluados: elegidos.length };
}
