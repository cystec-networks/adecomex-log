import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SolicitudResumen = { estado: string; monto: number | null; moneda: string | null };

const MONEDA_LABEL: Record<string, string> = { DOP: "RD$", USD: "US$", EUR: "€" };

const fmtMonto = (n: number) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Pending = still not approved/processed by staff; amounts are grouped by the currency of each request. */
export function resumirPagosTransportistaPendientes(solicitudes: SolicitudResumen[]) {
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const porMoneda = new Map<string, number>();
  for (const s of pendientes) {
    const moneda = s.moneda || "DOP";
    porMoneda.set(moneda, (porMoneda.get(moneda) ?? 0) + Number(s.monto ?? 0));
  }
  const sub = pendientes.length === 0
    ? "Sin pagos por aprobar"
    : [...porMoneda.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([moneda, monto]) => `${MONEDA_LABEL[moneda] ?? moneda} ${fmtMonto(monto)}`)
        .join(" · ");
  return { total: pendientes.length, sub };
}

/** Browser reads retain the same staff RLS as the payment requests screen. */
export async function obtenerPagosTransportistaPendientes(db: Pick<SupabaseClient<Database>, "from">) {
  const { data, error } = await db
    .from("solicitudes_pago_transporte")
    .select("estado, monto, moneda")
    .eq("estado", "pendiente");
  if (error) throw error;
  return resumirPagosTransportistaPendientes(data ?? []);
}
