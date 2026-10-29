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

/** Contenido de la confirmación que queda en la cola de pendientes; el script externo la envía respondiendo en el hilo original. */
export function confirmacionPendienteSolicitud(d: DatosConfirmacionCorreo) {
  return {
    para: d.remitente?.trim() || "",
    cc: copiasConfirmacion(d.destinatarios, d.cc),
    asunto: asuntoConfirmacion(d.numero, d.asunto),
    cuerpo: cuerpoConfirmacion(d),
  };
}

/** Para expedientes sin hilo de correo: abre Gmail listo para revisar y enviar a mano. */
export function correoConfirmacionSolicitud(d: DatosConfirmacionCorreo) {
  const c = confirmacionPendienteSolicitud(d);
  const params = new URLSearchParams({
    authuser: CORREO_OPERACIONES, from: CORREO_OPERACIONES, view: "cm", fs: "1",
    to: c.para, cc: c.cc, su: c.asunto, body: c.cuerpo,
  });
  return `https://mail.google.com/mail/?${params}`;
}

export const LOGO_FIRMA_URL = "https://app.adecomex.com/__l5e/assets-v1/d69c974e-d970-4b9d-a2fc-a7e94ffbc5cd/logo-adecomex-horizontal.png";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FIRMA_HTML = `<div style="font-family:Tahoma,Verdana,sans-serif;color:#1f3864;margin-top:16px">
<div style="font-size:17px;font-weight:bold;font-style:italic">Francisco E. López</div>
<div style="font-size:12px;font-weight:bold;font-style:italic">Especialista en Comercio Exterior</div>
<div style="font-family:'Times New Roman',serif;font-size:13px;font-weight:bold;margin-top:12px">SERVICIOS DE GESTIÓN Y LOGÍSTICA DE CARGAS</div>
<div style="font-family:'Times New Roman',serif;font-size:11px;color:#333">Oficina Comercial: Caonabo No. 85E, Los Restauradores, S. D, R.D.</div>
<div style="font-family:'Times New Roman',serif;font-size:11px;color:#333">Tels.: 809-531-5901 &nbsp;|&nbsp; 809-531-3888 &nbsp;|&nbsp; WhatSapp: 809-931-3246</div>
<div style="font-family:'Times New Roman',serif;font-size:11px;color:#333">Web: <a href="https://www.adecomex.com" style="color:#1155cc">www.adecomex.com</a> | Email: <a href="mailto:operaciones@adecomex.com" style="color:#1155cc">operaciones@adecomex.com</a></div>
<img src="${LOGO_FIRMA_URL}" alt="ADECOMEX SRL — Agencia de Comercio Exterior" width="260" style="margin-top:8px;display:block" />
</div>`;

/** Versión con formato del cuerpo (negritas, justificado y firma con logo); parte del texto revisado, así respeta las ediciones. */
export function cuerpoHtmlConfirmacion(cuerpo: string) {
  const texto = cuerpo.replace(/\r\n/g, "\n");
  // La firma de texto se reemplaza por la firma con formato.
  const corte = texto.search(/^\s*Francisco E\. López\s*$/m);
  const principal = corte >= 0 ? texto.slice(0, corte) : texto;
  const parrafos = principal.trim().split(/\n\s*\n/).map((p) => {
    let h = esc(p.trim()).replace(/\n/g, "<br>");
    h = h.replace(/^(Estimado Cliente:\s*)(.+)$/m, "$1<b>$2</b>");
    h = h.replace(/(REGISTRO\s*#[^<]*?ETA\s+[^<\s]+?)(\.?)\s*$/m, "<b>$1$2</b>");
    h = h.replace(/^(Descripción:[\s\S]*)$/, "<b>$1</b>");
    return `<p style="margin:0 0 14px 0;text-align:justify">${h}</p>`;
  }).join("\n");
  return `<div style="font-family:Tahoma,Verdana,sans-serif;font-size:14px;color:#000;max-width:720px">
${parrafos}
${corte >= 0 ? FIRMA_HTML : ""}
</div>`;
}
