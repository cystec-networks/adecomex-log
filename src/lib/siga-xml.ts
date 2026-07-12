// Generador de XML SIGA (ImportDUA) para la DGA - República Dominicana
// Basado en la estructura oficial ImportDUA.

export type BrokerConfig = {
  brokerCompanyCode: string;
  brokerEmployeeCode: string;
  brokerRnc: string;
  brokerName: string;
};

const BROKER_KEY = "adecomex.siga.broker";

export const DEFAULT_BROKER: BrokerConfig = {
  brokerCompanyCode: "",
  brokerEmployeeCode: "",
  brokerRnc: "",
  brokerName: "ADECOMEX SRL",
};

export function loadBrokerConfig(): BrokerConfig {
  try {
    const raw = localStorage.getItem(BROKER_KEY);
    if (!raw) return DEFAULT_BROKER;
    return { ...DEFAULT_BROKER, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BROKER;
  }
}

export function saveBrokerConfig(cfg: BrokerConfig) {
  localStorage.setItem(BROKER_KEY, JSON.stringify(cfg));
}

const TZ = "-04:00";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: unknown, indent = "    "): string {
  const v = value === null || value === undefined || value === "" ? "" : esc(value);
  return `${indent}<${name}>${v}</${name}>`;
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  // Devuelve YYYY-MM-DDTHH:mm:ss-04:00
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T00:00:00${TZ}`;
}

export type ValidationIssue = { field: string; label: string };

export function validateExpediente(exp: any, items: any[], broker: BrokerConfig): ValidationIssue[] {
  const missing: ValidationIssue[] = [];
  const need = (cond: any, field: string, label: string) => { if (!cond) missing.push({ field, label }); };

  need(exp?.numero, "numero", "Número de expediente");
  need(exp?.clientes?.rnc, "cliente.rnc", "RNC del cliente");
  need(exp?.clientes?.nombre, "cliente.nombre", "Nombre del cliente");
  need(exp?.regimen_codigo, "regimen_codigo", "Código de Régimen aduanero (Catálogo)");
  need(exp?.area_aduanera_codigo, "area_aduanera_codigo", "Código de Área/Administración aduanera");
  need(exp?.tipo_despacho_codigo, "tipo_despacho_codigo", "Código de Tipo de despacho");
  need(exp?.metodo_transporte_codigo, "metodo_transporte_codigo", "Código de Método de transporte");
  need(exp?.pais_origen_codigo, "pais_origen_codigo", "Código de País de origen");
  need(exp?.puerto_arribo_codigo, "puerto_arribo_codigo", "Código de Puerto de arribo");
  need(exp?.bl_awb, "bl_awb", "BL / AWB");
  need(exp?.total_fob != null, "total_fob", "Total FOB");
  need(exp?.total_cif != null, "total_cif", "Total CIF");
  need(exp?.peso_bruto != null, "peso_bruto", "Peso bruto");
  need(items && items.length > 0, "items", "Al menos 1 ítem de mercancía");
  items?.forEach((it, i) => {
    need(it.codigo_arancelario, `items[${i}].codigo_arancelario`, `Ítem ${it.item_no ?? i + 1}: Código arancelario`);
    need(it.unidad_codigo, `items[${i}].unidad_codigo`, `Ítem ${it.item_no ?? i + 1}: Código de unidad de medida`);
    need(it.cantidad != null, `items[${i}].cantidad`, `Ítem ${it.item_no ?? i + 1}: Cantidad`);
    need(it.valor_fob != null, `items[${i}].valor_fob`, `Ítem ${it.item_no ?? i + 1}: Valor FOB`);
  });
  need(broker.brokerCompanyCode, "broker.company", "Código de agencia (BrokerCompanyCode)");
  need(broker.brokerEmployeeCode, "broker.employee", "Código de tramitador (BrokerEmployeeCode)");
  need(broker.brokerRnc, "broker.rnc", "RNC de la agencia");
  return missing;
}

export function buildImportDUAXml(exp: any, items: any[], broker: BrokerConfig): string {
  const now = fmtDate(new Date().toISOString());
  const eta = fmtDate(exp.fecha_compromiso);
  const cliente = exp.clientes ?? {};

  const productos = (items ?? []).map((it, i) => {
    const num = it.item_no ?? i + 1;
    return `    <ImpDeclarationProduct>
      <LineNumber>${num}</LineNumber>
      <HSCode>${esc(it.codigo_arancelario)}</HSCode>
      <ProductDescription>${esc(it.detalle_producto ?? "")}</ProductDescription>
      <UnitOfMeasureCode>${esc(it.unidad_codigo)}</UnitOfMeasureCode>
      <Quantity>${Number(it.cantidad ?? 0)}</Quantity>
      <NetWeight>${Number(it.peso ?? 0)}</NetWeight>
      <FOBValue>${Number(it.valor_fob ?? 0)}</FOBValue>
      <CountryOfOriginCode>${esc(exp.pais_origen_codigo)}</CountryOfOriginCode>
    </ImpDeclarationProduct>`;
  }).join("\n");

  const contenedores = (exp.numeros_contenedores ?? "")
    .split(/[\s,;]+/).filter(Boolean)
    .map((c: string) => `    <ImpDeclarationContainer>\n      <ContainerNumber>${esc(c)}</ContainerNumber>\n    </ImpDeclarationContainer>`)
    .join("\n");

  const documentos = [
    { code: "380", desc: "Factura comercial", num: exp.factura_comercial },
    { code: "705", desc: "Bill of Lading / AWB", num: exp.bl_awb },
    exp.numero_certificado_origen && { code: "861", desc: "Certificado de Origen", num: exp.numero_certificado_origen },
    exp.numero_vuce && { code: "VUCE", desc: "Solicitud de Permiso VUCE", num: exp.numero_vuce },
  ].filter(Boolean).map((d: any) => `    <ImpDeclarationDocument>
      <DocumentTypeCode>${esc(d.code)}</DocumentTypeCode>
      <DocumentNumber>${esc(d.num)}</DocumentNumber>
      <DocumentDescription>${esc(d.desc)}</DocumentDescription>
    </ImpDeclarationDocument>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ImportDUA xmlns="http://www.dga.gov.do/siga/importdua">
  <Header>
${tag("DeclarationNumber", exp.numero)}
${tag("DeclarationDate", now)}
${tag("CustomsOfficeCode", exp.area_aduanera_codigo)}
${tag("RegimeCode", exp.regimen_codigo)}
${tag("DispatchTypeCode", exp.tipo_despacho_codigo)}
${tag("TransportMethodCode", exp.metodo_transporte_codigo)}
${tag("TradeAgreementCode", exp.acuerdo_codigo)}
${tag("CountryOfOriginCode", exp.pais_origen_codigo)}
${tag("CountryOfDispatchCode", exp.pais_procedencia_codigo || exp.pais_origen_codigo)}
${tag("ArrivalPortCode", exp.puerto_arribo_codigo)}
${tag("EstimatedArrivalDate", eta)}
${tag("BLNumber", exp.bl_awb)}
${tag("VesselName", exp.naviera)}
${tag("Incoterm", exp.incoterm)}
${tag("TotalFOB", exp.total_fob ?? 0)}
${tag("TotalInsurance", exp.seguro ?? 0)}
${tag("TotalFreight", exp.flete ?? 0)}
${tag("TotalOther", exp.otros ?? 0)}
${tag("TotalCIF", exp.total_cif ?? 0)}
${tag("GrossWeight", exp.peso_bruto ?? 0)}
${tag("NetWeight", exp.peso_neto ?? 0)}
  </Header>
  <ImpDeclarationSupplier>
${tag("ImporterRNC", cliente.rnc)}
${tag("ImporterName", cliente.nombre)}
${tag("ImporterAddress", cliente.direccion)}
${tag("SupplierName", exp.suplidor)}
${tag("BrokerCompanyCode", broker.brokerCompanyCode)}
${tag("BrokerCompanyRNC", broker.brokerRnc)}
${tag("BrokerCompanyName", broker.brokerName)}
${tag("BrokerEmployeeCode", broker.brokerEmployeeCode)}
  </ImpDeclarationSupplier>
${productos}
${contenedores}
${documentos}
</ImportDUA>
`;
}

export function downloadXml(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
