/**
 * Mecanismo reutilizable de oficios ADECOMEX SRL:
 *  - Membrete, firma y pie de página comunes (configurables en Administración).
 *  - Cada tipo de oficio solo define su asunto y su cuerpo a partir de datos variables.
 * Para agregar otro oficio (aforo, corrección de peso…), crear un nuevo `OficioTipo`.
 */
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo-adecomex-horizontal.png.asset.json";

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
  destinatario_nombre: "",
  destinatario_cargo: "Director General de Aduanas",
  destinatario_institucion: "Dirección General de Aduanas (DGA)",
  firmante_nombre: "Ing. Francisco E. López Martínez",
  firmante_cargo: "Gerente",
  ciudad: "Santo Domingo, D.N.",
  direccion: "",
  telefono: "",
  email: "",
};

export function parseOficioConfig(raw: string | null | undefined): OficioConfig {
  if (!raw) return { ...OFICIO_CONFIG_DEFAULT };
  try {
    return { ...OFICIO_CONFIG_DEFAULT, ...(JSON.parse(raw) as Partial<OficioConfig>) };
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

export function fechaLarga(d = new Date()) {
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" });
}

export type OficioTipo<D> = {
  id: string;
  titulo: string;
  /** Tipo con que se guarda en Documentos del expediente */
  tipoDocumento: string;
  asunto: (d: D) => string;
  cuerpo: (d: D) => string; // HTML
};

/** Envuelve el cuerpo con membrete, destinatario, firma y pie comunes. */
export function renderOficio<D>(tipo: OficioTipo<D>, datos: D, cfg: OficioConfig): string {
  const logo = typeof window !== "undefined" ? new URL(logoAsset.url, window.location.origin).href : logoAsset.url;
  const pie = [cfg.direccion, cfg.telefono && `Tel.: ${cfg.telefono}`, cfg.email].filter(Boolean).map(esc).join(" · ");
  return `<div class="doc-page" style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:12pt;line-height:1.5;width:100%;min-height:10in;display:flex;flex-direction:column">
<div style="text-align:center;border-bottom:2px solid #1f3a5f;padding-bottom:8px;margin-bottom:18px"><img src="${logo}" alt="ADECOMEX SRL" style="height:70px" crossorigin="anonymous"></div>
<div style="flex:1">
<p style="text-align:right">${esc(cfg.ciudad)}, ${esc(fechaLarga())}</p>
<p>${cfg.destinatario_nombre ? `<b>${esc(cfg.destinatario_nombre)}</b><br>` : ""}${esc(cfg.destinatario_cargo)}<br>${esc(cfg.destinatario_institucion)}<br>Su despacho.-</p>
<p><b>Asunto:</b> ${esc(tipo.asunto(datos))}</p>
<p>Distinguido señor Director:</p>
${tipo.cuerpo(datos)}
<p>Sin otro particular, nos despedimos atentamente,</p>
<p style="margin-top:60px">______________________________<br><b>${esc(cfg.firmante_nombre)}</b><br>${esc(cfg.firmante_cargo)}<br>ADECOMEX SRL</p>
</div>
<div style="border-top:1px solid #1f3a5f;margin-top:24px;padding-top:6px;text-align:center;font-size:9pt;color:#333">ADECOMEX SRL${pie ? ` · ${pie}` : ""}</div>
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
    const fila = (k: string, v: string) =>
      `<tr><td style="padding:2px 8px 2px 0;width:42%"><b>${esc(k)}:</b></td><td style="padding:2px 0">${esc(v || "—")}</td></tr>`;
    return `<p>Por medio de la presente, muy cortésmente le solicitamos la aplicación de una Rectificación Técnica a la mercancía que se detalla a continuación, debido a que fue declarada como <b>${esc(d.productoDeclarado || "—")}</b>, cuando en realidad corresponde a <b>${esc(d.productoCorrecto || "—")}</b>.</p>
<table style="border-collapse:collapse;width:100%;margin:6px 0 12px">
${fila("Consignatario", d.consignatario)}${fila("RNC", d.rnc)}${fila("Producto declarado", d.productoDeclarado)}${fila("Producto correcto", d.productoCorrecto)}${fila("Peso", d.peso ? `${d.peso} kg` : "")}${fila("País de procedencia", d.pais)}${fila("Puerto de llegada", d.puerto)}${fila("N.º de DUA", d.dua)}${fila("N.º de Permiso VUCE", d.permiso)}${d.tramite ? fila("N.º de Trámite", d.tramite) : ""}
</table>
<p>Anexamos los siguientes documentos:</p>
${d.anexos.length ? `<ul style="margin:0 0 12px 18px;padding:0">${d.anexos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "<p>—</p>"}`;
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
