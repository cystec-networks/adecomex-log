import { alertasExpedienteCompartidas, type AlertaExpediente, type DatosAlertasCompartidas, type ExpedienteAlertas } from "./alertas-expediente-compartidas";
import type { PlazoRegimen } from "./plazo-presentacion";
import type { Reminder, ReminderKind } from "./reminders";

export type ExpedientePanel = ExpedienteAlertas & {
  id: string; numero: string; updated_at: string;
  clientes: { nombre: string } | null;
};

// Adaptación de presentación: las condiciones y los textos proceden del evaluador del listado.
function categoria(alerta: AlertaExpediente): ReminderKind | null {
  if (alerta.id === "documentos" || alerta.id.startsWith("documento-")) return "expediente_documentos";
  if (alerta.id === "permisos") return "expediente_permisos";
  if (alerta.id === "pin-dga") return "expediente_pin";
  if (alerta.id === "presentacion" || alerta.id === "fecha-presentacion") return "plazo_presentacion";
  // Los avisos adicionales tienen identificadores posicionales; usar su categoría corta canónica.
  if (alerta.corta.startsWith("Etapa estancada")) return "expediente_etapa";
  if (alerta.corta.startsWith("Mora:")) return "expediente_mora";
  if (alerta.corta.startsWith("Recepción")) return "expediente_recepcion";
  if (alerta.corta.startsWith("VUCE por vencer:")) return "expediente_permisos";
  return null;
}

export function recordatoriosAlertasExpedientes(expedientes: ExpedientePanel[], plazos: PlazoRegimen[] | undefined, evidencias: Record<string, DatosAlertasCompartidas>, ahora = Date.now()): Reminder[] {
  return expedientes.flatMap(exp => {
    const datos = evidencias[exp.id];
    // No presentar documentos/permisos como ausentes mientras sus evidencias no han llegado.
    if (!datos) return [];
    const grupos = new Map<ReminderKind, AlertaExpediente[]>();
    for (const alerta of alertasExpedienteCompartidas(exp, plazos, datos, ahora)) {
      const kind = categoria(alerta);
      if (kind) grupos.set(kind, [...(grupos.get(kind) ?? []), alerta]);
    }
    return [...grupos].map(([kind, alertas]): Reminder => ({
      id: `panel-expediente:${kind}:${exp.id}`, kind,
      severity: alertas.some(a => a.tone === "danger") ? "critica" : alertas.some(a => a.tone === "warning") ? "alta" : "media",
      title: `Expediente ${exp.numero}`,
      detail: `${exp.clientes?.nombre ?? "Sin cliente"} · ${alertas.map(a => a.larga).join(" · ")}`,
      href: `/expedientes/${exp.id}`, createdAt: exp.updated_at, estado: exp.estado,
      diasRestantes: alertas.some(a => a.diasRestantes !== undefined)
        ? Math.min(...alertas.map(a => a.diasRestantes ?? Infinity)) : undefined,
    }));
  });
}