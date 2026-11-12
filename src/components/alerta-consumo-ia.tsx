import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { presupuestoBajo } from "@/lib/ia-consumo";

/** Aviso del Panel: créditos de IA agotados o menos del 20 % del presupuesto mensual. */
export function AlertaConsumoIa() {
  const { data } = useQuery({
    queryKey: ["ia-presupuesto", "panel"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estado_presupuesto_ia");
      if (error) return null;
      return data?.[0] ?? null;
    },
  });
  if (!data) return null;
  const restante = data.restante_pct != null ? Number(data.restante_pct) : null;
  const agotados = !!data.creditos_agotados_at;
  if (!agotados && !presupuestoBajo(restante)) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {agotados ? (
          <p><strong>Créditos de IA agotados.</strong> La lectura automática de documentos y correos está detenida hasta que se añadan créditos al espacio de trabajo.</p>
        ) : (
          <p><strong>Queda {restante} % del presupuesto mensual de IA.</strong> Revisa el consumo antes de que se agote.</p>
        )}
        <Link to="/admin/consumo-ia" className="text-[12px] underline underline-offset-2">Ver Consumo de IA</Link>
      </div>
    </div>
  );
}
