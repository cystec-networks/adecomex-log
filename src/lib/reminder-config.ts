// Umbrales configurables para recordatorios y alertas del sistema.
// Ajustables sin tocar la lógica general.
export const REMINDER_CONFIG = {
  // Solicitudes sin convertir a expediente durante X días
  solicitudSinConvertirDias: 5,
  // Expedientes activos sin actividad (updated_at) durante X días
  expedienteInactivoDias: 7,
  // Alerta de ETA próximo (expedientes / transportes)
  etaProximoDias: 3,
  // Permisos por vencer en X días
  permisoPorVencerDias: 15,
  // Transportes en tránsito con ETA vencida hace X días
  transporteRetrasadoDias: 1,
} as const;

export type ReminderConfig = typeof REMINDER_CONFIG;
