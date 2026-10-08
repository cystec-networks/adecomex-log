import { fmtLocalDate, hoyRD, parseLocalDate } from "./dates";
import { estadoIndex, fechasDespachoFaltantes } from "./estados-expediente";
import { diasRegimen, plazoEfectivo, venceEn, habilesRestantes, diasHabilesEntre, type PlazoRegimen } from "./plazo-presentacion";
import { alertasAdicionalesExpediente } from "./alertas-expediente";

export type AlertaExpediente = { id: string; corta: string; larga: string; tone: "danger" | "warning" | "info" };
type DatosAdicionales = Parameters<typeof alertasAdicionalesExpediente>[0];
export type ExpedienteAlertas = DatosAdicionales["expediente"] & {
  regimen_aduanero?: string | null; plazo_presentar_override?: number | null;
  fecha_presentacion_real?: string | null; liq_siga_termino_at?: string | null; liq_siga_fecha_pago?: string | null;
};
type Documento = { tipo: string; estado: string; storage_path: string | null; fecha_recepcion: string | null; created_at: string };
export type DatosAlertasCompartidas = Omit<DatosAdicionales, "expediente"> & { documentos?: Documento[] };

/** Avisos preventivos exclusivos del detalle; reutilizan los requisitos de despacho. */
export function alertasFechasDespacho(exp: { estado: string; liq_siga_fecha_pago?: string | null; fecha_aprobacion_despacho?: string | null }): string[] {
  const etapa = estadoIndex(exp.estado);
  if (etapa < 0 || etapa >= estadoIndex("despachado")) return [];
  return fechasDespachoFaltantes(exp).map(texto => texto.charAt(0).toUpperCase() + texto.slice(1));
}

/** PIN DGA: reloj calendario; nunca sustituye al plazo legal en días hábiles. */
export function alertaPinDga(exp: Pick<ExpedienteAlertas, "liq_siga_termino_at" | "liq_siga_fecha_pago">, ahora = Date.now()): AlertaExpediente | null {
  if (!exp.liq_siga_termino_at || exp.liq_siga_fecha_pago) return null;
  const limite = new Date(exp.liq_siga_termino_at).getTime();
  if (!Number.isFinite(limite)) return null;
  const ms = limite - ahora;
  const vencido = ms <= 0;
  const minutos = Math.floor(Math.abs(ms) / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);
  const partes = [
    dias ? `${dias} ${dias === 1 ? "día" : "días"}` : "",
    horas % 24 ? `${horas % 24} ${horas % 24 === 1 ? "hora" : "horas"}` : "",
    minutos % 60 ? `${minutos % 60} ${minutos % 60 === 1 ? "minuto" : "minutos"}` : "",
  ].filter(Boolean);
  const duracion = partes.length ? partes.join(" y ") : "menos de un minuto";
  return {
    id: "pin-dga", tone: vencido ? "danger" : horas < 48 ? "warning" : "info",
    corta: `${vencido ? "Venció" : "Vence"} ${dias ? `${dias}d` : `${Math.round(Math.abs(ms) / 3600000)}h`}`,
    larga: `PIN de pago DGA: ${vencido ? "Vencido hace" : "Vence en"} ${duracion}`,
  };
}

/** Un mismo resultado ofrece sus dos textos; ambas pantallas comparten reglas y evidencias. */
export function alertasExpedienteCompartidas(expediente: ExpedienteAlertas, plazos: PlazoRegimen[] | undefined, datos: DatosAlertasCompartidas = {}, ahora = Date.now()): AlertaExpediente[] {
  const alertas: AlertaExpediente[] = [];
  const agregar = (id: string, corta: string, larga: string, tone: AlertaExpediente["tone"] = "warning") => alertas.push({ id, corta, larga, tone });
  const pin = alertaPinDga(expediente, ahora);
  if (pin) alertas.push(pin);
  const { dias } = plazoEfectivo(expediente, plazos);
  const vencimiento = expediente.fecha_llegada_real && dias && diasRegimen(expediente.regimen_aduanero, plazos)
    ? venceEn(expediente.fecha_llegada_real, dias) : null;
  const posterior = estadoIndex(expediente.estado) >= estadoIndex("verificar");
  const presentado = expediente.fecha_presentacion_real ? parseLocalDate(expediente.fecha_presentacion_real) : null;
  if (vencimiento && presentado && !isNaN(presentado.getTime())) {
    if (presentado > vencimiento) {
      const retraso = Math.abs(diasHabilesEntre(presentado, vencimiento));
      agregar("presentacion", `Presentación +${retraso}dh`, `Presentación fuera de plazo (${retraso} días hábiles de retraso)`, "danger");
    }
  } else if (vencimiento && !posterior) {
    const restantes = Math.abs(habilesRestantes(vencimiento));
    const unidad = restantes === 1 ? "día hábil" : "días hábiles";
    const vencido = vencimiento < hoyRD();
    agregar("presentacion", vencido ? `Presentación vencida ${restantes}dh` : restantes ? `Presentar ${restantes}dh` : "Presentar hoy",
      vencido ? `Plazo de presentación vencido desde ${fmtLocalDate(vencimiento.toISOString().slice(0, 10))} (${restantes} ${unidad} transcurridos)` : restantes ? `Vence en ${restantes} ${unidad} el plazo de presentación` : "Vence hoy el plazo de presentación", vencido ? "danger" : "warning");
  }
  if (posterior && !expediente.fecha_presentacion_real) agregar("fecha-presentacion", "Falta fecha presentación", "Falta capturar la fecha de presentación");
  if (datos.documentos) {
    const faltantes = ["Factura comercial", "Bill of Lading"].filter(tipo => !datos.documentos?.some(d => d.tipo === tipo && d.storage_path?.trim()));
    if (faltantes.length) agregar("documentos", `Documentos: ${faltantes.length}`, `Documentos pendientes: ${faltantes.join(", ")}`);
    const ultimos = new Map<string, Documento>();
    for (const d of datos.documentos) {
      const previo = ultimos.get(d.tipo);
      if (!previo || new Date(d.fecha_recepcion ?? d.created_at).getTime() >= new Date(previo.fecha_recepcion ?? previo.created_at).getTime()) ultimos.set(d.tipo, d);
    }
    for (const d of ultimos.values()) {
      if (["pendiente", "observado", "vencido"].includes(d.estado) && !faltantes.includes(d.tipo)) agregar(`documento-${d.tipo}`, `${d.tipo}: ${d.estado}`, `${d.tipo}: ${d.estado}`);
    }
  }
  const pendientes = (datos.permisos ?? []).filter(p => p.estado !== "aprobado");
  if (pendientes.length) agregar("permisos", `Permisos: ${pendientes.length}`, `Permisos pendientes de aprobación: ${pendientes.length}`);
  const entrada = { expediente, ...datos };
  const largas = alertasAdicionalesExpediente(entrada);
  const cortas = alertasAdicionalesExpediente(entrada, "corta");
  largas.forEach((larga, i) => agregar(`adicional-${i}`, cortas[i] ?? larga, larga, "danger"));
  return alertas;
}