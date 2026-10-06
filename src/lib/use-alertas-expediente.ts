import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DatosAlertasCompartidas } from "./alertas-expediente-compartidas";

type VinculoExpediente = { id: string; cliente_id: string | null; factura_ecf_id: string | null };

/** Lectura por lotes, sin una consulta adicional por cada fila del listado. */
export function useDatosAlertasListado(expedientes: VinculoExpediente[]) {
  const ids = expedientes.map(e => e.id).sort();
  return useQuery({
    queryKey: ["alertas-expedientes-listado", expedientes.map(e => [e.id, e.cliente_id, e.factura_ecf_id]).sort()],
    enabled: ids.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<Record<string, DatosAlertasCompartidas>> => {
      const [permisos, documentos, recepciones, incidencias, vinculadas] = await Promise.all([
        supabase.from("permisos").select("expediente_id,estado,fecha_vencimiento").in("expediente_id", ids).is("eliminado_en", null),
        supabase.from("documentos").select("expediente_id,tipo,estado,storage_path,fecha_recepcion,created_at").in("expediente_id", ids),
        supabase.from("recepciones").select("expediente_id").in("expediente_id", ids),
        supabase.from("incidencias").select("expediente_id,tipo,estado,severidad").in("expediente_id", ids).eq("tipo", "Diferencia de peso/cantidad").in("estado", ["abierta", "en_gestion"]),
        supabase.from("facturas").select("expediente_id,factura_ecf_id").in("expediente_id", ids).is("deleted_at", null),
      ]);
      for (const result of [permisos, documentos, recepciones, incidencias, vinculadas]) if (result.error) throw result.error;
      const facturaIds = [...new Set([...expedientes.map(e => e.factura_ecf_id), ...(vinculadas.data ?? []).map(f => f.factura_ecf_id)].filter((id): id is string => !!id))];
      const facturas = facturaIds.length ? await supabase.from("facturas_ecf").select("id,cliente_id,fecha_vencimiento_pago,monto_total,cxc_pagos(monto)").in("id", facturaIds).is("eliminado_en", null).neq("estado", "anulada") : { data: [], error: null };
      if (facturas.error) throw facturas.error;
      return Object.fromEntries(expedientes.map(e => {
        const propias = new Set([e.factura_ecf_id, ...(vinculadas.data ?? []).filter(f => f.expediente_id === e.id).map(f => f.factura_ecf_id)]);
        return [e.id, {
          permisos: (permisos.data ?? []).filter(p => p.expediente_id === e.id),
          documentos: (documentos.data ?? []).filter(d => d.expediente_id === e.id),
          tieneRecepcion: (recepciones.data ?? []).some(r => r.expediente_id === e.id),
          incidencias: (incidencias.data ?? []).filter(i => i.expediente_id === e.id),
          facturas: (facturas.data ?? []).filter(f => propias.has(f.id) && (!e.cliente_id || f.cliente_id === e.cliente_id)),
        }];
      }));
    },
  });
}

export function useDatosAlertasExpediente(id: string, clienteId: string | null, facturaId: string | null, enabled: boolean) {
  const facturas = useQuery({
    queryKey: ["cxc-facturas", "alertas-expediente", id, clienteId, facturaId],
    enabled,
    queryFn: async () => {
      const { data: vinculadas, error: vinculoError } = await supabase.from("facturas")
        .select("factura_ecf_id").eq("expediente_id", id).is("deleted_at", null);
      if (vinculoError) throw vinculoError;
      const ids = [...new Set([facturaId, ...(vinculadas ?? []).map((f) => f.factura_ecf_id)].filter((v): v is string => !!v))];
      if (!ids.length) return [];
      let query = supabase.from("facturas_ecf")
        .select("id, fecha_vencimiento_pago, monto_total, cxc_pagos(monto)")
        .in("id", ids).is("eliminado_en", null).neq("estado", "anulada");
      if (clienteId) query = query.eq("cliente_id", clienteId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });
  const recepciones = useQuery({
    queryKey: ["recepciones", id, "alertas-header"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("recepciones").select("id").eq("expediente_id", id).limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const incidencias = useQuery({
    queryKey: ["incidencias", id, "alertas-header"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("incidencias").select("tipo, estado, severidad")
        .eq("expediente_id", id).eq("tipo", "Diferencia de peso/cantidad").in("estado", ["abierta", "en_gestion"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  return { facturas: facturas.data, incidencias: incidencias.data, tieneRecepcion: !!recepciones.data?.length };
}