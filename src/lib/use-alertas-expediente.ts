import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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