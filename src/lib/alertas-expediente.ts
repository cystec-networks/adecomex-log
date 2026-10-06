import { daysFromToday } from "./dates";
import { estadoIndex, ESTADO_LABEL } from "./estados-expediente";
import { REMINDER_CONFIG } from "./reminder-config";

type Permiso = { estado: string; fecha_vencimiento: string | null };
type Factura = {
  fecha_vencimiento_pago: string | null;
  monto_total: number;
  cxc_pagos: { monto: number }[];
};
type Incidencia = { tipo: string; estado: string; severidad: string };
type Expediente = { estado: string; fecha_llegada_real: string | null; fecha_compromiso: string | null };

/** Solo condiciones propias del expediente; no utiliza deuda global del cliente. */
export function alertasAdicionalesExpediente({ expediente, permisos = [], facturas = [], incidencias = [], tieneRecepcion = false }: {
  expediente: Expediente;
  permisos?: Permiso[];
  facturas?: Factura[];
  incidencias?: Incidencia[];
  tieneRecepcion?: boolean;
}, formato: "corta" | "larga" = "larga"): string[] {
  const alertas: string[] = [];
  const proximos = permisos.filter((p) => {
    if (!["solicitado", "en_tramite"].includes(p.estado)) return false;
    const dias = daysFromToday(p.fecha_vencimiento);
    return dias >= 0 && dias <= REMINDER_CONFIG.permisoPorVencerDias;
  });
  if (proximos.length) alertas.push(formato === "corta" ? `VUCE por vencer: ${proximos.length}` : `Permiso VUCE por vencer: ${proximos.length} (próximos ${REMINDER_CONFIG.permisoPorVencerDias} días)`);

  const enMora = facturas.filter((f) => {
    const pagado = f.cxc_pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    return daysFromToday(f.fecha_vencimiento_pago) < 0 && Number(f.monto_total) > 0 && pagado <= 0;
  });
  if (enMora.length) alertas.push(formato === "corta" ? `Mora: ${enMora.length}` : `Factura en mora: ${enMora.length} sin pago registrado`);

  // La incidencia conserva la evaluación realizada al recibir, incluida la
  // tolerancia elegida en ese momento (no se guarda en recepciones).
  const discrepancias = tieneRecepcion ? incidencias.filter((i) =>
    i.tipo === "Diferencia de peso/cantidad" && ["abierta", "en_gestion"].includes(i.estado)) : [];
  if (discrepancias.length) {
    const critica = discrepancias.some((i) => i.severidad === "critica");
    alertas.push(formato === "corta" ? `Recepción${critica ? " crítica" : ""}: ${discrepancias.length}` : `Discrepancia de Recepción${critica ? " crítica" : ""}: ${discrepancias.length} pendiente(s)`);
  }

  const etapa = estadoIndex(expediente.estado);
  const diasLlegada = daysFromToday(expediente.fecha_llegada_real || expediente.fecha_compromiso);
  // Cerca de la llegada: aún Recibido. Llegado: aún sin Manifestar.
  // Una semana después: todavía sin Presentar. No penalizar un flujo avanzado.
  const atrasada = etapa >= 0 && (
    (diasLlegada >= 0 && diasLlegada <= REMINDER_CONFIG.etaProximoDias && etapa < estadoIndex("en_transito")) ||
    (diasLlegada < 0 && etapa < estadoIndex("manifestado")) ||
    (diasLlegada <= -REMINDER_CONFIG.expedienteInactivoDias && etapa < estadoIndex("presentar"))
  );
  if (atrasada) alertas.push(formato === "corta" ? "Etapa estancada" : `Etapa estancada: ${ESTADO_LABEL[expediente.estado]} · ${diasLlegada < 0 ? `llegada hace ${Math.abs(diasLlegada)} días` : `llegada en ${diasLlegada} días`}`);
  return alertas;
}