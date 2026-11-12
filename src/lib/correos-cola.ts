/**
 * Cola de correos detenidos por la IA (límite diario con acción «bloqueo» o créditos agotados).
 * Reglas puras compartidas por el webhook, la tarea programada y el Registro.
 */
export type CausaCola = "limite_ia" | "creditos_ia";

export const RESULTADO_COLA: Record<CausaCola, string> = {
  limite_ia: "en cola por límite de IA",
  creditos_ia: "en cola por créditos de IA agotados",
};

export const textoCola = (causa: string | null | undefined) =>
  RESULTADO_COLA[(causa as CausaCola) in RESULTADO_COLA ? (causa as CausaCola) : "limite_ia"];

/** Correos de la cola que se procesan en un turno: ninguno con el límite vigente, uno de prueba sin créditos. */
export function correosPorTurno(pausa: CausaCola | null, maximo: number): number {
  if (pausa === "limite_ia") return 0;
  if (pausa === "creditos_ia") return 1;
  return Math.max(0, maximo);
}

/** Un correo de la cola «procesando» sin cierre tras estos minutos vuelve a su turno. */
export const MINUTOS_COLA_INTERRUMPIDA = 10;

/** Orden de llegada: primer intento más antiguo primero (desempate por id para un orden estable). */
export function ordenCola<T extends { primer_intento_at: string; id: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => a.primer_intento_at.localeCompare(b.primer_intento_at) || a.id.localeCompare(b.id));
}
