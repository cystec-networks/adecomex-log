/**
 * Mecanismo reutilizable de oficios ADECOMEX SRL:
 *  - Membrete, firma y pie de página comunes (configurables en Administración).
 *  - Cada tipo de oficio solo define su asunto y su cuerpo a partir de datos variables.
 * Para agregar otro oficio (aforo, corrección de peso…), crear un nuevo `OficioTipo`.
 */
import { supabase } from "@/integrations/supabase/client";
import membreteAsset from "@/assets/oficio-membrete.png.asset.json";
import firmaAsset from "@/assets/oficio-img1.png.asset.json";
import selloAsset from "@/assets/oficio-img2.jpg.asset.json";

export const OFICIO_CONFIG_KEY = "oficios_config";

export type OficioConfig = {
  destinatario_nombre: string;
  destinatario_cargo: string;
  destinatario_institucion: string;
  firmante_nombre: string;
  firmante_cargo: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  email: string;
};

export const OFICIO_CONFIG_DEFAULT: OficioConfig = {
  destinatario_nombre: "Nelson de Jesús Arroyo Pedormo",
  destinatario_cargo: "Director General de Aduanas",
  destinatario_institucion: "Ciudad",
  firmante_nombre: "Ing. Francisco E. López Martínez",
  firmante_cargo: "Gerente ADECOMEX, SRL",
  ciudad: "Santo Domingo, Rep. Dom.",
  direccion: "Calle Respaldo San Miguel # 12, Bayona, Santo Domingo Oeste, Republica Dominicana.",
  telefono: "(809) 531-3888, Móvil.: (809) 931-3246",
  email: "adecomex@claro.net.do",
};

export function parseOficioConfig(raw: string | null | undefined): OficioConfig {
  if (!raw) return { ...OFICIO_CONFIG_DEFAULT };
  try {
    const parsed = JSON.parse(raw) as Partial<OficioConfig>;
    const out = { ...OFICIO_CONFIG_DEFAULT };
    for (const k of Object.keys(out) as (keyof OficioConfig)[]) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return { ...OFICIO_CONFIG_DEFAULT };
  }
}

export async function fetchOficioConfig(): Promise<OficioConfig> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", OFICIO_CONFIG_KEY).maybeSingle();
  return parseOficioConfig(data?.value ?? null);
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Formato de la carta modelo: "23 de Septiembre del 2026." */
export function fechaLarga(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} del ${d.getFullYear()}.`;
}

export type OficioTipo<D> = {
  id: string;
  titulo: string;
  /** Tipo con que se guarda en Documentos del expediente */
  tipoDocumento: string;
  asunto: (d: D) => string;
  cuerpo: (d: D) => string; // HTML
};

const abs = (u: string) => (typeof window !== "undefined" ? new URL(u, window.location.origin).href : u);

/** Envuelve el cuerpo con membrete, destinatario, firma y pie comunes (réplica de la carta modelo). */
export function renderOficio<D>(tipo: OficioTipo<D>, datos: D, cfg: OficioConfig): string {
  const contacto = [cfg.email && `E-mail: ${esc(cfg.email)}`, cfg.telefono && `Tel.: ${esc(cfg.telefono)}`].filter(Boolean).join(", ");
  return `<div class="doc-page" style="font-family:'Times New Roman',Times,serif;color:#000;font-size:12pt;line-height:1.35;width:100%;min-height:10in;display:flex;flex-direction:column">
<div style="border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:36px">
<img src="${abs(membreteAsset.url)}" alt="ADECOMEX SRL" style="height:90px;display:block" crossorigin="anonymous">
<div style="font-family:Arial,sans-serif;font-size:11pt;margin-left:115px">RNC: 130-481301</div>
</div>
<div style="flex:1">
<p style="margin:0 0 36px">${esc(cfg.ciudad)}<br>${esc(fechaLarga())}</p>
<p style="margin:0 0 16px">Señor:<br>${cfg.destinatario_nombre ? `<b>${esc(cfg.destinatario_nombre)}</b><br>` : ""}${esc(cfg.destinatario_cargo)}.<br>${esc(cfg.destinatario_institucion)}.</p>
<p style="margin:0 0 12px">Asunto: <b>${esc(tipo.asunto(datos))}</b>.</p>
<p style="margin:0 0 12px">Distinguido Señor,</p>
${tipo.cuerpo(datos)}
<p style="margin:24px 0 16px;text-align:justify">Sin otro particular por el momento y en espera de que nuestra solicitud pueda ser procesada a la mayor brevedad posible, queda de usted:</p>
<p style="margin:0">Saludos Cordiales,</p>
<div style="display:flex;align-items:flex-end;gap:24px;margin-top:4px">
<div style="width:260px"><img src="${abs(firmaAsset.url)}" alt="Firma" style="width:250px;display:block;margin-bottom:-18px" crossorigin="anonymous"><div style="border-top:1px solid #000;padding-top:4px;position:relative">${esc(cfg.firmante_nombre)},<br>${esc(cfg.firmante_cargo)}.</div></div>
<img src="${abs(selloAsset.url)}" alt="Sello" style="width:130px" crossorigin="anonymous">
</div>
</div>
<div style="border-top:1px solid #000;margin-top:16px;padding-top:4px;text-align:center;font-family:Arial,sans-serif;font-size:10pt">${esc(cfg.direccion)}${contacto ? `<br>${contacto}` : ""}</div>
</div>`;
}

// ---------- Oficio de Rectificación Técnica ----------
export type DatosRectificacion = {
  productoCorrecto: string;
  consignatario: string;
  rnc: string;
  productoDeclarado: string;
  peso: string;
  pais: string;
  puerto: string;
  dua: string;
  permiso: string;
  tramite: string;
  anexos: string[];
};

export const OFICIO_RECTIFICACION: OficioTipo<DatosRectificacion> = {
  id: "rectificacion_tecnica",
  titulo: "Oficio de Rectificación Técnica",
  tipoDocumento: "Oficio de Rectificación Técnica",
  asunto: (d) => `Solicitud de aplicación Rectificación Técnica de ${d.productoCorrecto || "—"}`,
  cuerpo: (d) => {
    const li = (t: string) => `<div>-${t}</div>`;
    return `<p style="margin:0 0 16px;text-align:justify">Después de externarle un cordial saludo, tenga la presente por propósito solicitar su aprobación en la <b>Rectificación Técnica de ${esc(d.productoDeclarado || "—")}${d.peso ? ` para ${esc(d.peso)}Kgs` : ""},</b> es ${esc(d.productoCorrecto || "—")}, consignada a <b>${esc(d.consignatario || "—")}${d.rnc ? `, RNC: ${esc(d.rnc)}` : ""},</b> procedente de <b>${esc((d.pais || "—").toUpperCase())},</b> la cual llegó al país por el puerto de ${esc((d.puerto || "—").toUpperCase())}.</p>
<p style="margin:0">Para los fines de lugar anexamos copia de los documentos requeridos, mismos que citamos a continuación:</p>
${li(`Declaración única aduanera (DUA) No. <b>${esc(d.dua || "—")}.</b>`)}
${li("Reporte de Liquidación de impuestos.")}
${li("Copia del Conocimiento de embarque (BL)")}
${li("Copia de la factura comercial.")}
${li("Copia del certificado de origen.")}
${li("Copia de certificado Sanitario/Análisis.")}
${li(`Copia de Permiso VUCE de Agricultura No.: <b>${esc(d.permiso || "—")}.</b>`)}`;
  },
};

// ---------- Exportadores ----------
export function descargarWord(html: string, nombre: string) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(nombre)}</title><style>@page{size:8.5in 11in;margin:0.8in}</style></head><body>${html}</body></html>`;
  const blob = new Blob(["\ufeff", doc], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function htmlAPdf(el: HTMLElement): Promise<any> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 15;
  const w = pw - 2 * m;
  const h = (canvas.height * w) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.92);
  if (h <= ph - 2 * m) {
    pdf.addImage(img, "JPEG", m, m, w, h);
  } else {
    const scale = (ph - 2 * m) / h;
    pdf.addImage(img, "JPEG", m + (w - w * scale) / 2, m, w * scale, ph - 2 * m);
  }
  return pdf;
}
