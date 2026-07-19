// Alerta Ley 168-21: 5 días laborables desde la llegada de la mercancía
// (fecha_compromiso / ETA) para presentar la declaración.
import { parseLocalDate } from "@/lib/dates";

export type AlertaDeclaracion = {
  diasRestantes: number;
  tone: "danger" | "warning" | "info";
};

function diasHabilesEntre(desde: Date, hasta: Date): number {
  // Inclusivo en ambos extremos. Lunes-Viernes.
  const a = new Date(desde); a.setHours(0, 0, 0, 0);
  const b = new Date(hasta); b.setHours(0, 0, 0, 0);
  if (b < a) return 0;
  let count = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function alertaDeclaracionTardia(exp: {
  estado?: string | null;
  fecha_compromiso?: string | null;
  sla_dias?: number | null;
}): AlertaDeclaracion | null {
  if (!exp) return null;
  if (exp.estado !== "digitar" && exp.estado !== "en_transito") return null;
  if (!exp.fecha_compromiso) return null;

  const eta = parseLocalDate(exp.fecha_compromiso);
  if (isNaN(eta.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  eta.setHours(0, 0, 0, 0);
  if (eta > hoy) return null;

  const sla = typeof exp.sla_dias === "number" && exp.sla_dias > 0 ? exp.sla_dias : 5;
  const transcurridos = diasHabilesEntre(eta, hoy);
  const diasRestantes = sla - transcurridos;
  const tone: AlertaDeclaracion["tone"] =
    diasRestantes <= 0 ? "danger" : diasRestantes <= 2 ? "warning" : "info";
  return { diasRestantes, tone };
}
