import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { accionLimiteIa, nombreFuncionIa, presupuestoBajo } from "@/lib/ia-consumo";

type SobreLimite = { funcion: string; limite: number; gastado: number; accion: string | null };

const creditos = (n: number) => Number(n).toLocaleString("es-DO", { maximumFractionDigits: 2 });

/** Aviso del Panel: créditos agotados, presupuesto bajo, límites diarios superados y correos en cola. */
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
  const sobre = (Array.isArray(data.funciones_sobre_limite) ? data.funciones_sobre_limite : []) as SobreLimite[];
  const cola = Number(data.correos_en_cola ?? 0);
  const mensajes: React.ReactNode[] = [];
  if (agotados)
    mensajes.push(<p key="agotados"><strong>Créditos de IA agotados.</strong> La lectura automática de documentos está detenida hasta que se añadan créditos al espacio de trabajo; los correos que lleguen quedan en cola.</p>);
  else if (presupuestoBajo(restante))
    mensajes.push(restante != null && restante <= 0
      ? <p key="presupuesto"><strong>Se superó el presupuesto mensual de IA.</strong> Gastado este mes: {Number(data.gastado_mes ?? 0).toFixed(2)} de {Number(data.presupuesto ?? 0).toFixed(2)} créditos.</p>
      : <p key="presupuesto"><strong>Queda {restante} % del presupuesto mensual de IA.</strong> Revisa el consumo antes de que se agote.</p>);
  for (const f of sobre) {
    const soloAlerta = accionLimiteIa(f.funcion, f.accion) === "alerta";
    mensajes.push(
      <p key={f.funcion}>
        <strong>{nombreFuncionIa(f.funcion)} superó su límite diario</strong> ({creditos(f.gastado)} de {creditos(f.limite)} créditos).{" "}
        {soloAlerta ? "Solo alerta: sigue funcionando." : "Detenida hasta mañana."}
      </p>,
    );
  }
  if (cola > 0)
    mensajes.push(
      <p key="cola">
        <strong>{cola} correo{cola === 1 ? "" : "s"} en cola</strong> {data.correos_cola_causa === "creditos_ia" ? "por créditos de IA agotados" : "por límite de IA"}: se procesarán solos en orden de llegada.{" "}
        <Link to="/expedientes/correo" search={{ registro: "en_cola" }} className="underline underline-offset-2">Ver cola</Link>
      </p>,
    );
  if (!mensajes.length) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {mensajes}
        <Link to="/admin/consumo-ia" className="text-[12px] underline underline-offset-2">Ver Consumo de IA</Link>
      </div>
    </div>
  );
}
