// Generador de XML CertificateOrigin (Certificado de Origen electrónico) para SIGA - DGA
// Sigue el mismo patrón de validación/generación que buildImportDUAXml en siga-xml.ts.

import { personCode, type ValidationIssue } from "@/lib/siga-xml";

/** RNC de ADECOMEX usado como solicitante del certificado */
export const APPLICANT_CODE = "RNC214130481301";

export type CertMaps = {
  /** codigo -> nombre de catalogo_tratamientos_certificado */
  tratamientos?: Record<string, string>;
};

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1]}-${m[2]}-${m[3]}T00:00:00` : "";
}

/** Una fila por partida arancelaria única entre los ítems de mercancía */
export function partidasUnicas(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  (items ?? []).forEach((it) => {
    const hs = String(it?.codigo_arancelario ?? "").trim();
    if (!hs || seen.has(hs)) return;
    seen.add(hs);
    out.push(it);
  });
  return out;
}

/** Bloquean la descarga */
export function validateCertificado(exp: any, items: any[]): ValidationIssue[] {
  const missing: ValidationIssue[] = [];
  const need = (cond: any, field: string, label: string) => { if (!cond) missing.push({ field, label }); };

  need(exp?.area_aduanera_codigo, "area_aduanera_codigo", "Código de Área/Administración aduanera");
  need(exp?.clientes?.rnc, "cliente.rnc", "RNC del cliente");
  need(exp?.clientes?.nombre, "cliente.nombre", "Nombre del cliente");
  need(exp?.certificado_periodo_desde, "certificado_periodo_desde", "Período del certificado: Desde");
  need(exp?.certificado_periodo_hasta, "certificado_periodo_hasta", "Período del certificado: Hasta");
  need(exp?.certificado_uso_codigo, "certificado_uso_codigo", "Uso del certificado (UseType)");
  need(exp?.certificado_emisor_codigo, "certificado_emisor_codigo", "Tipo de emisor (IssuerType)");
  need(exp?.certificado_tratamiento_codigo, "certificado_tratamiento_codigo", "Tratamiento (TreatmentCode)");
  need(exp?.pais_origen_codigo, "pais_origen_codigo", "Código de País de origen");

  const partidas = partidasUnicas(items ?? []);
  need(partidas.length > 0, "items", "Al menos 1 partida arancelaria en la mercancía");
  return missing;
}

/** No bloquean: códigos de catálogo pendientes de homologación con la DGA */
export function pendingCertificadoCodes(exp: any, items: any[], maps?: CertMaps): ValidationIssue[] {
  const pending: ValidationIssue[] = [];
  const check = (v: any, field: string, label: string) => { if (!v) pending.push({ field, label }); };

  check(maps?.tratamientos?.[String(exp?.certificado_tratamiento_codigo ?? "")], "tratamiento_nombre", "Nombre del tratamiento (TreatmentName)");
  check(exp?.suplidor_rnc, "suplidor_rnc", "RNC del exportador / suplidor (ExporterCode)");
  partidasUnicas(items ?? []).forEach((it) => {
    check(it.criterio_origen_codigo, `criterio_${it.codigo_arancelario}`, `Partida ${it.codigo_arancelario}: Criterio de origen`);
    check(it.metodo_calificacion_codigo, `metodo_${it.codigo_arancelario}`, `Partida ${it.codigo_arancelario}: Método de calificación`);
  });
  return pending;
}

export function buildCertificateOriginXml(exp: any, items: any[], maps?: CertMaps): string {
  const cliente = exp?.clientes ?? {};
  const nat = "214";
  const origen = exp?.pais_origen_codigo ?? "";
  const ownerCode = personCode(cliente.rnc, nat);
  const tratamiento = String(exp?.certificado_tratamiento_codigo ?? "");
  const tratamientoNombre = maps?.tratamientos?.[tratamiento] ?? "";

  const T = (name: string, value: unknown, indent = "  ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const cabecera = [
    T("AreaCode", exp?.area_aduanera_codigo),
    T("FormNo", ""),
    T("ApplyStartDate", fmtDate(exp?.certificado_periodo_desde)),
    T("ApplyEndDate", fmtDate(exp?.certificado_periodo_hasta)),
    T("CertificationOwnerCode", ownerCode),
    T("CertificationOwnerName", cliente.nombre),
    T("UseType", exp?.certificado_uso_codigo),
    T("IssuerType", exp?.certificado_emisor_codigo),
    T("TreatmentCode", tratamiento),
    T("TreatmentName", tratamientoNombre),
    T("TransportDescription", exp?.certificado_transporte_desc),
    T("Remark", exp?.certificado_remark),
    T("ImporterCode", ownerCode),
    T("ExporterCode", exp?.suplidor_rnc ? personCode(exp.suplidor_rnc, origen, "TAX") : ""),
    T("ApplicantCode", APPLICANT_CODE),
    T("ProductorCode", exp?.certificado_productor_rnc
      ? personCode(exp.certificado_productor_rnc, nat, "TAX")
      : (exp?.suplidor_rnc ? personCode(exp.suplidor_rnc, origen, "TAX") : "")),
  ].join("\n");

  const detalles = partidasUnicas(items ?? []).map((it) => `  <CertificateOriginDetail>
${T("HSCode", String(it.codigo_arancelario ?? "").replace(/\D/g, ""), "   ")}
${T("CriteriaCode", it.criterio_origen_codigo, "   ")}
${T("MethodCode", it.metodo_calificacion_codigo, "   ")}
${T("CountryCode", origen, "   ")}
${T("Remark", "", "   ")}
  </CertificateOriginDetail>`).join("\n");

  return `<CertificateOrigin xmlns="http://tempuri.org/Certificate.xsd">
${cabecera}${detalles ? "\n" + detalles : ""}
</CertificateOrigin>
`;
}
