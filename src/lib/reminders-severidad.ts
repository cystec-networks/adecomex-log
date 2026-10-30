import type { ReminderSeverity } from "./reminders";

/**
 * Prioridad de un expediente con ETA próxima:
 * atrasado/vencido lo marca otro recordatorio (crítica); aquí 1–2 días = ALTA, 3 o más = MEDIA.
 */
export function severidadEtaProximo(dias: number): ReminderSeverity {
  return dias <= 2 ? "alta" : "media";
}
