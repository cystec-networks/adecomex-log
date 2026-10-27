import { fmtLocalDate } from "@/lib/dates";

export const CORREO_OPERACIONES = "operaciones@adecomex.com";

const FIRMA = `Le agradecemos mucho por su solicitud,

Saludos Cordiales,

Francisco E. López
Especialista en Comercio Exterior

SERVICIOS DE GESTIÓN Y LOGÍSTICA DE CARGAS
Oficina Comercial: Caonabo No. 85E, Los Restauradores, S. D, R.D.
Tels.: 809-531-5901 | 809-531-3888 | WhatSapp: 809-931-3246
Web: www.adecomex.com | Email: operaciones@adecomex.com`;

export interface DatosConfirmacionCorreo {
  numero: string;
  cliente: string | null | undefined;
  eta: string | null | undefined;
  descripcion: string | null | undefined;
  remitente: string | null | undefined;
  asunto: string | null | undefined;
  destinatarios?: string | null | undefined;
  cc?: string | null | undefined;
}

/** «REGISTRO #N : asunto»; si el asunto ya trae REGISTRO #, no se duplica. */
export function asuntoConfirmacion(numero: string, asunto: string | null | undefined) {
  const limpio = (asunto ?? "").trim();
  if (/^\s*REGISTRO\s*#/i.test(limpio)) return limpio;
  return `REGISTRO #${numero} : ${limpio}`.trimEnd();
}

/** Une destinatarios y CC originales sin repetir direcciones. */
export function copiasConfirmacion(destinatarios: string | null | undefined, cc: string | null | undefined) {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const parte of [destinatarios, cc]) {
    for (const dir of (parte ?? "").split(/[;,]/)) {
      const d = dir.trim();
      if (d && !vistos.has(d.toLowerCase())) { vistos.add(d.toLowerCase()); lista.push(d); }
    }
  }
  return lista.join(", ");
}

/** Datos que faltan y deben completarse a mano antes de enviar. */
export function faltantesConfirmacion(d: Pick<DatosConfirmacionCorreo, "eta" | "descripcion">) {
  const faltantes: string[] = [];
  if (!d.eta?.trim()) faltantes.push("ETA");
  if (!d.descripcion?.trim()) faltantes.push("Descripción");
  return faltantes;
}

export function cuerpoConfirmacion(d: DatosConfirmacionCorreo) {
  const eta = d.eta?.trim() ? fmtLocalDate(d.eta) : "«COMPLETAR: ETA»";
  const descripcion = d.descripcion?.trim() || "«COMPLETAR: Descripción»";
  return `Estimado Cliente: ${d.cliente?.trim() || ""}.

Tenemos a bien confirmarle la recepción de su solicitud de servicio, el cual estaremos gestionando a la mayor brevedad posible bajo el número de seguimiento: REGISTRO #${d.numero}, ETA ${eta}.

Descripción: ${descripcion}.

Nuestro equipo le estará informando sobre el proceso en que se encuentra su embarque, de necesitar información favor contactarnos para su debida retroalimentación refiriéndose al número de seguimiento antes asignado.

${FIRMA}`;
}

/** Mismo patrón de «Preparar para enviar»: abre Gmail listo para revisar; no envía solo. */
export function correoConfirmacionSolicitud(d: DatosConfirmacionCorreo) {
  const params = new URLSearchParams({
    authuser: CORREO_OPERACIONES, from: CORREO_OPERACIONES, view: "cm", fs: "1",
    to: d.remitente?.trim() || "",
    cc: copiasConfirmacion(d.destinatarios, d.cc),
    su: asuntoConfirmacion(d.numero, d.asunto),
    body: cuerpoConfirmacion(d),
  });
  return `https://mail.google.com/mail/?${params}`;
}
