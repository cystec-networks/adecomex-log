// Generador de XML SIGA (ImportDUA) para la DGA - República Dominicana
// Replica EXACTAMENTE la estructura del esquema oficial
// http://aduanas.gob.do/XSD/ImportClearance/ImportDUA.xsd

export type BrokerConfig = {
  brokerCompanyCode: string;
  brokerEmployeeCode: string;
  brokerRnc: string;
  brokerName: string;
  // Datos adicionales requeridos por el esquema ImportDUA
  declarantCode: string;
  declarantName: string;
  declarantNationality: string;
  clearanceType: string;
  transportCompanyCode: string;
  transportNationality: string;
  /** Código numérico DGA del país (214 = República Dominicana) */
  defaultNationality: string;
};

const BROKER_KEY = "adecomex.siga.broker";

export const DEFAULT_BROKER: BrokerConfig = {
  brokerCompanyCode: "",
  brokerEmployeeCode: "",
  brokerRnc: "",
  brokerName: "ADECOMEX SRL",
  declarantCode: "",
  declarantName: "",
  declarantNationality: "",
  clearanceType: "IM4",
  transportCompanyCode: "",
  transportNationality: "214",
  defaultNationality: "214",
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

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00${TZ}`;
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${TZ}`;
}

function num(v: unknown): string {
  const n = Number(v ?? 0);
  return isFinite(n) ? String(n) : "0";
}

// Formato de identificación SIGA: [RNC|CED|PAS]<número>
function personCode(id?: string | null): string {
  if (!id) return "";
  const clean = String(id).trim().replace(/[-\s]/g, "");
  if (/^(RNC|CED|PAS)/i.test(clean)) return clean.toUpperCase();
  return `RNC${clean}`;
}

export type ValidationIssue = { field: string; label: string };

// Bloquean la descarga: datos duros del expediente y códigos ya disponibles.
export function validateExpediente(exp: any, items: any[], broker: BrokerConfig): ValidationIssue[] {
  const missing: ValidationIssue[] = [];
  const need = (cond: any, field: string, label: string) => { if (!cond) missing.push({ field, label }); };

  need(exp?.numero, "numero", "Número de expediente");
  need(exp?.clientes?.rnc, "cliente.rnc", "RNC del cliente");
  need(exp?.clientes?.nombre, "cliente.nombre", "Nombre del cliente");
  need(exp?.area_aduanera_codigo, "area_aduanera_codigo", "Código de Área/Administración aduanera");
  need(exp?.pais_origen_codigo, "pais_origen_codigo", "Código de País de origen");
  need(exp?.puerto_arribo_codigo, "puerto_arribo_codigo", "Código de Puerto de arribo (EntryPort)");
  need(exp?.bl_awb, "bl_awb", "BL / AWB");
  need(exp?.factura_comercial, "factura_comercial", "Número de factura comercial");
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
  need(broker.declarantCode, "broker.declarantCode", "Código del declarante (DeclarantCode)");
  need(broker.declarantName, "broker.declarantName", "Nombre del declarante");
  need(broker.clearanceType, "broker.clearanceType", "Tipo de despacho SIGA (ClearanceType)");
  return missing;
}

// NO bloquean la descarga: códigos pendientes de homologación con la DGA.
// Se emiten como etiquetas XML vacías.
export function pendingDgaCodes(exp: any): ValidationIssue[] {
  const pending: ValidationIssue[] = [];
  const check = (v: any, field: string, label: string) => { if (!v) pending.push({ field, label }); };
  check(exp?.regimen_codigo, "regimen_codigo", "Régimen aduanero (RegimenCode)");
  check(exp?.metodo_transporte_codigo, "metodo_transporte_codigo", "Método de transporte (TransportMethod)");
  check(exp?.acuerdo_codigo, "acuerdo_codigo", "Acuerdo / Preferencia comercial (AgreementCode)");
  check(exp?.pais_procedencia_codigo, "pais_procedencia_codigo", "País de procedencia (DepartureCountryCode)");
  return pending;
}

export function buildImportDUAXml(exp: any, items: any[], broker: BrokerConfig): string {
  const cliente = exp.clientes ?? {};
  const nat = broker.defaultNationality || "DO";
  const importerCode = personCode(cliente.rnc);
  const origen = exp.pais_origen_codigo ?? "";

  const T = (name: string, value: unknown, indent = "    ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const cabecera = [
    T("ClearanceType", broker.clearanceType),
    T("AreaCode", exp.area_aduanera_codigo),
    T("BLNo", exp.bl_awb),
    T("ConsigneeCode", importerCode),
    T("ConsigneeName", cliente.nombre),
    T("ConsigneeNationality", nat),
    T("CommercialInvoiceno", exp.factura_comercial),
    T("DestinationLocationCode", exp.puerto_arribo_codigo),
    T("EntryPort", exp.puerto_arribo_codigo),
    T("DepartureCountryCode", exp.pais_procedencia_codigo || origen),
    T("TransportCompanyCode", broker.transportCompanyCode),
    T("TransportNationality", broker.transportNationality || nat),
    T("TransportMethod", exp.metodo_transporte_codigo),
    T("EntryPlanDate", fmtDate(exp.fecha_compromiso)),
    T("EntryDate", fmtDate(exp.fecha_recibido || exp.fecha_compromiso)),
    T("ImporterCode", importerCode),
    T("ImporterName", cliente.nombre),
    T("ImporterNationality", nat),
    T("BrokerEmployeeCode", broker.brokerEmployeeCode),
    T("BrokerCompanyCode", broker.brokerCompanyCode),
    T("DeclarantCode", broker.declarantCode),
    T("DeclarantName", broker.declarantName),
    T("DeclarantNationality", broker.declarantNationality || nat),
    T("RegimenCode", exp.regimen_codigo),
    T("AgreementCode", exp.acuerdo_codigo),
    T("TotalFOB", num(exp.total_fob)),
    T("InsuranceValue", num(exp.seguro)),
    T("FreightValue", num(exp.flete)),
    T("OtherValue", num(exp.otros)),
    T("TotalCIF", num(exp.total_cif)),
    T("TotalWeight", num(exp.peso_bruto)),
    T("NetWeight", num(exp.peso_neto ?? exp.peso_bruto)),
    T("Remark", exp.observaciones),
  ].join("\n");

  const supplier = `    <ImpDeclarationSupplier>
${T("ForeignSupplierName", exp.suplidor, "      ")}
${T("ForeignSupplierCode", personCode(exp.suplidor_rnc), "      ")}
${T("ForeignSupplierNationality", origen, "      ")}
    </ImpDeclarationSupplier>`;

  const certOrigen = exp.numero_certificado_origen ? "true" : "false";

  const productos = (items ?? []).map((it) => {
    const desc = it.detalle_producto ?? "";
    return `    <ImpDeclarationProduct>
${T("HSCode", it.codigo_arancelario, "      ")}
${T("ProductCode", "", "      ")}
${T("productname", desc, "      ")}
${T("BrandCode", "", "      ")}
${T("BrandName", "N/A", "      ")}
${T("ModelCode", "", "      ")}
${T("ModelName", "N/A", "      ")}
${T("ProductStatusCode", "", "      ")}
${T("ProductYear", "", "      ")}
${T("FOBValue", num(it.valor_fob), "      ")}
${T("UnitCode", it.unidad_codigo, "      ")}
${T("Qty", num(it.cantidad), "      ")}
${T("Weight", num(it.peso), "      ")}
${T("ProductSpecification", "", "      ")}
${T("TempProductYN", "false", "      ")}
${T("CertificateOrignYN", certOrigen, "      ")}
${T("CertificateOriginNo", exp.numero_certificado_origen, "      ")}
${T("OriginCountry", origen, "      ")}
${T("OrganicYN", "false", "      ")}
${T("GradeAlcohol", "", "      ")}
${T("CustomerSalesPrice", "", "      ")}
${T("ProductSerialNo", "", "      ")}
${T("VehicleType", "", "      ")}
${T("VehicleChassis", "", "      ")}
${T("VehicleColor", "", "      ")}
${T("VehicleMotor", "", "      ")}
${T("VehicleCC", "", "      ")}
${T("ProductDescription", desc, "      ")}
${T("Remark", "", "      ")}
    </ImpDeclarationProduct>`;
  }).join("\n");

  const docs: Array<{ code: string; desc: string; num: string }> = [];
  if (exp.factura_comercial) docs.push({ code: "380", desc: "Factura comercial", num: exp.factura_comercial });
  if (exp.bl_awb) docs.push({ code: "705", desc: "Conocimiento de embarque / AWB", num: exp.bl_awb });
  if (exp.numero_certificado_origen) docs.push({ code: "861", desc: "Certificado de Origen", num: exp.numero_certificado_origen });
  if (exp.numero_vuce) docs.push({ code: "VUCE", desc: "Solicitud de Permiso VUCE", num: exp.numero_vuce });

  const documentos = docs.map((d) => `    <ImpDeclarationDocument>
${T("RequiredDocumentCode", d.code, "      ")}
${T("OtherDocTypeDesc", d.desc, "      ")}
${T("RequiredDocumentNo", d.num, "      ")}
${T("BizDocIssuerName", exp.suplidor || broker.brokerName, "      ")}
${T("BizDocIssuerEmail", "", "      ")}
${T("BizDocIssuerTel", "", "      ")}
    </ImpDeclarationDocument>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<ImportDUA xmlns="http://aduanas.gob.do/XSD/ImportClearance/ImportDUA.xsd">
  <ImpDeclaration xmlns="">
${cabecera}
${supplier}
${productos}${documentos ? "\n" + documentos : ""}
  </ImpDeclaration>
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
