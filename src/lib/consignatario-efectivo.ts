import { supabase } from "@/integrations/supabase/client";

/**
 * Consignatario efectivo de un Expediente: el cliente endosado si existe un
 * endoso activo (no anulado); si no, el cliente original. Nunca modifica
 * `expedientes.cliente_id`; solo se usa al generar documentos nuevos.
 */
export type ConsignatarioEfectivo = {
  cliente: any | null;
  original: any | null;
  endosado: boolean;
  fechaEndoso: string | null;
};

export async function fetchConsignatarioEfectivo(
  expedienteId: string,
  clienteOriginal: any | null,
): Promise<ConsignatarioEfectivo> {
  const { data } = await supabase
    .from("expediente_endosos")
    .select("fecha_endoso, endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(*)")
    .eq("expediente_id", expedienteId)
    .eq("activo", true)
    .maybeSingle();
  const endosado = (data as any)?.endosado ?? null;
  if (!endosado) return { cliente: clienteOriginal, original: clienteOriginal, endosado: false, fechaEndoso: null };
  return { cliente: endosado, original: clienteOriginal, endosado: true, fechaEndoso: (data as any)?.fecha_endoso ?? null };
}

/** Devuelve una copia del expediente con `clientes` = consignatario efectivo y `cliente_original`. */
export async function conConsignatarioEfectivo<T extends { id: string; clientes?: any }>(exp: T) {
  const ef = await fetchConsignatarioEfectivo(exp.id, exp.clientes ?? null);
  if (!ef.endosado) return exp as T & { cliente_original?: any };
  return { ...exp, clientes: ef.cliente, cliente_id: ef.cliente?.id ?? (exp as any).cliente_id, cliente_original: ef.original };
}

/** Nota de trazabilidad para el Remark del DUA cuando hay endoso activo. */
export function notaEndosoRemark(original: any | null): string {
  const nombre = original?.nombre?.trim() || "consignatario original";
  return `Mercancía endosada de ${nombre}, carta de aceptación adjunta`;
}
