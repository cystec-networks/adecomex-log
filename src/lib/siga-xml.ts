// Generador de XML SIGA (ImportDUA) para la DGA - República Dominicana
// Replica EXACTAMENTE la estructura del esquema oficial
// http://aduanas.gob.do/XSD/ImportClearance/ImportDUA.xsd

export type BrokerConfig = {
  /** RNC de ADECOMEX SRL (se emite como RNC214XXXXXXXXX en BrokerCompanyCode) */
  brokerCompanyCode: string;
  /** Licencia/código del despachante (ej. 072-08) */
  brokerEmployeeCode: string;
  brokerRnc: string;
  brokerName: string;
  /** Cédula del agente aduanero que despacha (DeclarantCode) */
  declarantCode: string;
  /** Nombre de la PERSONA despachante (DeclarantName) */
  declarantName: string;
  declarantNationality: string;
  clearanceType: string;
  /** Nombre del tipo de despacho (solo para mostrar en la UI) */
  clearanceTypeName?: string;
  transportCompanyCode: string;
  transportNationality: string;
  /** Código numérico DGA del país (214 = República Dominicana) */
  defaultNationality: string;
};

const BROKER_KEY = "adecomex.siga.broker";

export const DEFAULT_BROKER: BrokerConfig = {
  brokerCompanyCode: "130481301",
  brokerEmployeeCode: "072-08",
  brokerRnc: "130481301",
  brokerName: "ADECOMEX SRL",
  declarantCode: "00108459645",
  declarantName: "FRANCISCO ENERIO LOPEZ MARTINEZ",
  declarantNationality: "214",
  clearanceType: "IM4",
  clearanceTypeName: "",
  transportCompanyCode: "",
  transportNationality: "214",
  defaultNationality: "214",
};

// Migra valores ISO alfa-2 antiguos ("DO") al código numérico DGA (214)
function migrarNat(v: string | undefined, fallback: string): string {
  if (!v) return fallback;
  return /^[A-Za-z]{2,3}$/.test(v) ? "214" : v;
}

export function loadBrokerConfig(): BrokerConfig {
  try {
    const raw = localStorage.getItem(BROKER_KEY);
    if (!raw) return DEFAULT_BROKER;
    const cfg = { ...DEFAULT_BROKER, ...JSON.parse(raw) } as BrokerConfig;
    cfg.defaultNationality = migrarNat(cfg.defaultNationality, "214");
    cfg.transportNationality = migrarNat(cfg.transportNationality, "214");
    cfg.declarantNationality = migrarNat(cfg.declarantNationality, "214");
    // BrokerCompanyCode debe ser el RNC de la agencia, no la licencia (072-08)
    const bcc = cleanId(cfg.brokerCompanyCode);
    if (!bcc || bcc.length < 9 || bcc === cleanId(cfg.brokerEmployeeCode)) {
      cfg.brokerCompanyCode = DEFAULT_BROKER.brokerCompanyCode;
    }
    // RNC de relleno usado en pruebas (ATIVA) → RNC real de ADECOMEX
    if (!cfg.brokerRnc || cfg.brokerRnc.replace(/\D/g, "") === "130594181") {
      cfg.brokerRnc = DEFAULT_BROKER.brokerRnc;
    }
    if (!cfg.declarantCode) cfg.declarantCode = DEFAULT_BROKER.declarantCode;
    if (!cfg.declarantName) cfg.declarantName = DEFAULT_BROKER.declarantName;
    if (!cfg.brokerEmployeeCode) cfg.brokerEmployeeCode = DEFAULT_BROKER.brokerEmployeeCode;
    return cfg;
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

// Formato de identificación SIGA: [RNC|CED|PAS] + código país DGA + número
// Ej.: RNC + 214 + 130594181 => RNC214130594181
export function personCode(id?: string | null, countryCode = "214"): string {
  if (!id) return "";
  let clean = String(id).trim().replace(/[-\s.]/g, "").toUpperCase();
  let prefix = "RNC";
  const m = /^(RNC|CED|PAS)(.*)$/.exec(clean);
  if (m) { prefix = m[1]; clean = m[2]; }
  const cc = String(countryCode || "").trim();
  if (cc && clean.startsWith(cc)) return `${prefix}${clean}`;
  return `${prefix}${cc}${clean}`;
}

/** Limpia una cédula/RNC dejando solo dígitos y letras (sin guiones ni espacios) */
export function cleanId(id?: string | null): string {
  return id ? String(id).trim().replace(/[-\s.]/g, "") : "";
}

/** FOB unitario = FOB total de la línea / cantidad (mínimo 4 decimales) */
export function unitFob(fobTotal: unknown, qty: unknown): string {
  const t = Number(fobTotal ?? 0);
  const q = Number(qty ?? 0);
  if (!isFinite(t) || !isFinite(q) || q === 0) return num(fobTotal);
  const u = t / q;
  if (!isFinite(u)) return "0";
  const s = u.toFixed(Math.max(4, 6));
  return s.replace(/(\.\d{4}\d*?)0+$/, "$1");
}

// Códigos RDOC de la DGA (catálogo de documentos requeridos)
export const RDOC = {
  FACTURA_COMERCIAL: "RDOC-001",
  BL_MANIFIESTO: "RDOC-010-R1-1",
} as const;

// Régimen: nombre mostrado en el formulario -> código SIGA
const REGIMEN_CODIGOS: Record<string, string> = {
  "despacho a consumo": "1",
};

/** Normaliza un texto para comparar contra nombres de catálogo (sin acentos, minúsculas) */
export function normNombre(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Busca un código en un mapa nombre→código de forma flexible (exacto o por inclusión) */
function lookupCode(nombre: string, map?: Record<string, string>): string {
  if (!nombre || !map) return "";
  if (map[nombre]) return map[nombre];
  for (const [k, v] of Object.entries(map)) {
    if (k && (k === nombre || k.includes(nombre) || nombre.includes(k))) return v;
  }
  return "";
}

export function resolveRegimenCode(exp: any, regimenMap?: Record<string, string>): string {
  if (exp?.regimen_codigo) return String(exp.regimen_codigo);
  const nombre = normNombre(exp?.regimen_aduanero);
  if (!nombre) return "";
  return lookupCode(nombre, regimenMap) || REGIMEN_CODIGOS[nombre] || "";
}

/** Método de transporte: traduce exp.medio_transporte (texto) al código de catalogo_metodos_transporte */
export function resolveTransportMethodCode(exp: any, map?: Record<string, string>): string {
  if (exp?.metodo_transporte_codigo) return String(exp.metodo_transporte_codigo);
  const nombre = normNombre(exp?.medio_transporte);
  if (!nombre) return "";
  return lookupCode(nombre, map);
}

/** Acuerdo comercial: traduce exp.acuerdo_comercial (texto) al código de catalogo_acuerdos */
export function resolveAgreementCode(exp: any, map?: Record<string, string>): string {
  if (exp?.acuerdo_codigo) return String(exp.acuerdo_codigo);
  const nombre = normNombre(exp?.acuerdo_comercial);
  if (!nombre || nombre === "n/a" || nombre === "ninguno") return "";
  return lookupCode(nombre, map);
}

export type SigaMaps = {
  regimen?: Record<string, string>;
  transporte?: Record<string, string>;
  acuerdo?: Record<string, string>;
  /** Código RDOC del permiso VUCE (catalogo_documentos_requeridos) */
  vuceDocCode?: string;
};

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
  need(broker.brokerCompanyCode, "broker.company", "RNC de la agencia (BrokerCompanyCode)");
  need(broker.brokerEmployeeCode, "broker.employee", "Licencia/código del despachante (BrokerEmployeeCode)");
  need(broker.declarantCode, "broker.declarantCode", "Cédula del despachante (DeclarantCode)");
  need(broker.declarantName, "broker.declarantName", "Nombre del despachante (DeclarantName)");
  need(broker.brokerRnc, "broker.rnc", "RNC de la agencia");
  need(broker.clearanceType, "broker.clearanceType", "Tipo de despacho SIGA (ClearanceType)");
  return missing;
}

// NO bloquean la descarga: códigos pendientes de homologación con la DGA.
// Se emiten como etiquetas XML vacías.
export function pendingDgaCodes(exp: any, maps?: SigaMaps, items?: any[]): ValidationIssue[] {
  const pending: ValidationIssue[] = [];
  const check = (v: any, field: string, label: string) => { if (!v) pending.push({ field, label }); };
  check(resolveRegimenCode(exp, maps?.regimen), "regimen_codigo", "Régimen aduanero (RegimenCode)");
  check(resolveTransportMethodCode(exp, maps?.transporte), "metodo_transporte_codigo", "Método de transporte (TransportMethod)");
  check(resolveAgreementCode(exp, maps?.acuerdo), "acuerdo_codigo", "Acuerdo / Preferencia comercial (AgreementCode)");
  check(exp?.pais_procedencia_codigo, "pais_procedencia_codigo", "País de procedencia (DepartureCountryCode)");
  if (exp?.numero_vuce) check(maps?.vuceDocCode, "vuce_doc_code", "Código de documento del Permiso VUCE (RequiredDocumentCode)");
  (items ?? []).forEach((it, i) => {
    check(it?.estado_producto_codigo, `items[${i}].estado_producto_codigo`, `Ítem ${it?.item_no ?? i + 1}: Estado del producto (ProductStatusCode)`);
  });
  return pending;
}

export function buildImportDUAXml(
  exp: any,
  items: any[],
  broker: BrokerConfig,
  maps?: SigaMaps,
): string {
  const cliente = exp.clientes ?? {};
  const nat = broker.defaultNationality || "214";
  // El declarante es el propio Importador (igual que en el modelo de referencia)
  const importerCode = personCode(cliente.rnc, nat);
  const origen = exp.pais_origen_codigo ?? "";

  const T = (name: string, value: unknown, indent = "    ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const cabecera = [
    T("FormNo", ""),
    T("DeclarationDate", ""),
    T("ClearanceType", broker.clearanceType),
    T("AreaCode", exp.area_aduanera_codigo),
    T("BLNo", exp.bl_awb),
    T("ManifestNo", ""),
    T("CargoControlNo", ""),
    T("ConsigneeCode", importerCode),
    T("ConsigneeName", cliente.nombre),
    T("ConsigneeNationality", nat),
    T("CommercialInvoiceno", exp.factura_comercial),
    T("DestinationLocationCode", exp.puerto_arribo_codigo),
    T("EntryPort", exp.puerto_arribo_codigo),
    T("DepartureCountryCode", exp.pais_procedencia_codigo || origen),
    T("TransportCompanyCode", broker.transportCompanyCode),
    T("TransportNationality", broker.transportNationality || nat),
    T("TransportMethod", resolveTransportMethodCode(exp, maps?.transporte)),
    T("EntryPlanDate", fmtDate(exp.fecha_compromiso)),
    T("EntryDate", fmtDate(exp.fecha_recibido || exp.fecha_compromiso)),
    T("ImporterCode", importerCode),
    T("ImporterName", cliente.nombre),
    T("ImporterNationality", nat),
    T("BrokerEmployeeCode", broker.brokerEmployeeCode),
    T("BrokerCompanyCode", personCode(broker.brokerCompanyCode, nat)),
    T("DeclarantCode", cleanId(broker.declarantCode)),
    T("DeclarantName", broker.declarantName),
    T("DeclarantNationality", migrarNat(broker.declarantNationality, nat)),
    T("RegimenCode", resolveRegimenCode(exp, maps?.regimen)),
    T("AgreementCode", resolveAgreementCode(exp, maps?.acuerdo)),
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
${T("ForeignSupplierCode", personCode(exp.suplidor_rnc, origen), "      ")}
${T("ForeignSupplierNationality", origen, "      ")}
    </ImpDeclarationSupplier>`;

  const certOrigen = exp.numero_certificado_origen ? "true" : "false";

  const productos = (items ?? []).map((it) => {
    const desc = it.detalle_producto ?? "";
    return `    <ImpDeclarationProduct>
${T("HSCode", it.codigo_arancelario, "      ")}
${T("ProductCode", it.product_code, "      ")}
${T("productname", desc, "      ")}
${T("BrandCode", it.cod_marca, "      ")}
${T("BrandName", it.marca || "N/A", "      ")}
${T("ModelCode", it.cod_modelo, "      ")}
${T("ModelName", it.modelo || "N/A", "      ")}
${T("ProductStatusCode", it.estado_producto_codigo, "      ")}
${T("ProductYear", "", "      ")}
${T("FOBValue", unitFob(it.valor_fob, it.cantidad), "      ")}
${T("UnitCode", it.unidad_codigo, "      ")}
${T("Qty", num(it.cantidad), "      ")}
${T("Weight", num(it.peso), "      ")}
${T("ProductSpecification", it.especificaciones, "      ")}
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
  if (exp.factura_comercial) docs.push({ code: RDOC.FACTURA_COMERCIAL, desc: "Factura comercial", num: exp.factura_comercial });
  if (exp.bl_awb) docs.push({ code: RDOC.BL_MANIFIESTO, desc: "Conocimiento de embarque / Manifiesto", num: exp.bl_awb });
  if (exp.numero_certificado_origen) docs.push({ code: "", desc: "Certificado de Origen", num: exp.numero_certificado_origen });
  if (exp.numero_vuce) docs.push({ code: maps?.vuceDocCode ?? "", desc: "Solicitud de Permiso VUCE", num: exp.numero_vuce });

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
