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
  /** Email de ADECOMEX (emisor de los documentos ante SIGA) */
  brokerEmail: string;
  /** Teléfono de ADECOMEX (emisor de los documentos ante SIGA) */
  brokerTel: string;
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
  clearanceType: "IC38-002",
  clearanceTypeName: "",
  transportCompanyCode: "",
  transportNationality: "214",
  defaultNationality: "214",
  brokerEmail: "operaciones@adecomex.com",
  brokerTel: "809-531-3888",
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
    // Los tipos de despacho antiguos ("IM4") no existen en SIGA: se migran al código oficial.
    if (!cfg.clearanceType || !/^IC38-/.test(cfg.clearanceType)) cfg.clearanceType = DEFAULT_BROKER.clearanceType;
    if (!cfg.brokerEmployeeCode) cfg.brokerEmployeeCode = DEFAULT_BROKER.brokerEmployeeCode;
    if (["info@adecomex.com.do", "contabilidad@adecomex.com"].includes(cfg.brokerEmail?.trim().toLowerCase())) {
      cfg.brokerEmail = DEFAULT_BROKER.brokerEmail;
    }
    if (["809-000-0000", "809-237-5418"].includes(cfg.brokerTel?.trim())) {
      cfg.brokerTel = DEFAULT_BROKER.brokerTel;
    }
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
export function personCode(id?: string | null, countryCode = "214", defaultPrefix = "RNC"): string {
  if (!id) return "";
  let clean = String(id).trim().replace(/[-\s.]/g, "").toUpperCase();
  let prefix = defaultPrefix;
  const m = /^(RNC|CED|PAS|TID|TAX)(.*)$/.exec(clean);
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

/** Estado del producto por defecto en SIGA (IC04-001 = Nuevo) */
export const ESTADO_PRODUCTO_NUEVO = "IC04-001";

/** Comodín oficial de SIGA para suplidor extranjero sin código registrado */
export const SUPPLIER_NO_ASIGNADO = { code: "999999999999", name: "*** NO ASIGNADO ***" } as const;


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

  const T = (name: string, value: unknown, indent = "  ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  // ORDEN DE ETIQUETAS: debe coincidir EXACTAMENTE con la secuencia del XSD de SIGA.
  // (validado contra un XML real aceptado por la DGA)
  const cabecera = [
    T("DeclarationDate", ""),
    T("ClearanceType", broker.clearanceType),
    T("AreaCode", exp.area_aduanera_codigo),
    T("FormNo", ""),
    T("BLNo", exp.bl_awb),
    T("ManifestNo", ""),
    T("ConsigneeCode", importerCode),
    T("ConsigneeName", cliente.nombre),
    T("ConsigneeNationality", nat),
    T("CargoControlNo", ""),
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

  // SIGA rechaza el suplidor sin código: usa el comodín oficial cuando no se conoce el RNC.
  const supplierCode = exp.suplidor_rnc ? personCode(exp.suplidor_rnc, origen, "TID") : SUPPLIER_NO_ASIGNADO.code;
  const supplierName = exp.suplidor_rnc ? exp.suplidor : (exp.suplidor || SUPPLIER_NO_ASIGNADO.name);
  const supplier = `  <ImpDeclarationSupplier>
${T("ForeignSupplierName", supplierName, "   ")}
${T("ForeignSupplierCode", supplierCode, "   ")}
${T("ForeignSupplierNationality", exp.suplidor_rnc ? origen : "", "   ")}
  </ImpDeclarationSupplier>`;

  const certOrigen = exp.numero_certificado_origen ? "true" : "false";

  const productos = (items ?? []).map((it) => {
    const desc = it.detalle_producto ?? "";
    return `  <ImpDeclarationProduct>
${T("HSCode", String(it.codigo_arancelario ?? "").replace(/\D/g, ""), "   ")}
${T("ProductCode", it.product_code, "   ")}
${T("productname", desc, "   ")}
${T("BrandCode", it.cod_marca || "NA", "   ")}
${T("BrandName", it.marca || "N/A", "   ")}
${T("ModelCode", it.cod_modelo || "NA", "   ")}
${T("ModelName", it.modelo || "N/A", "   ")}
${T("ProductStatusCode", it.estado_producto_codigo || ESTADO_PRODUCTO_NUEVO, "   ")}
${T("ProductYear", "", "   ")}
${T("FOBValue", unitFob(it.valor_fob, it.cantidad), "   ")}
${T("UnitCode", it.unidad_codigo, "   ")}
${T("Qty", num(it.cantidad), "   ")}
${T("Weight", num(it.peso), "   ")}
${T("ProductSpecification", it.especificaciones, "   ")}
${T("TempProductYN", "false", "   ")}
${T("CertificateOrignYN", certOrigen, "   ")}
${T("CertificateOriginNo", exp.numero_certificado_origen, "   ")}
${T("OriginCountry", it.pais_origen_codigo || origen, "   ")}
${T("OrganicYN", "false", "   ")}
${T("GradeAlcohol", "0", "   ")}
${T("CustomerSalesPrice", "0", "   ")}
${T("ProductSerialNo", "", "   ")}
${T("VehicleType", "", "   ")}
${T("VehicleChassis", "", "   ")}
${T("VehicleColor", "", "   ")}
${T("VehicleMotor", "", "   ")}
${T("VehicleCC", "", "   ")}
${T("ProductDescription", desc, "   ")}
${T("Remark", desc, "   ")}
  </ImpDeclarationProduct>`;
  }).join("\n");

  // Emisor de los documentos: se toma de los datos capturados en el expediente,
  // con el cliente y el agente (ADECOMEX) como respaldo cuando falten.
  const cli = exp.clientes ?? {};
  const tel = (broker.brokerTel ?? "").trim();
  const mail = (broker.brokerEmail ?? "").trim();
  const nombreSuplidor = (exp.suplidor || "").trim();
  const nombreNaviera = (exp.naviera || "").trim();

  const docs: Array<{ code: string; num: string; issuer: string }> = [];
  if (exp.bl_awb) {
    docs.push({
      code: RDOC.BL_MANIFIESTO,
      num: exp.bl_awb,
      issuer: nombreNaviera || nombreSuplidor || cli.nombre || broker.brokerName,
    });
  }
  if (exp.factura_comercial) {
    docs.push({
      code: RDOC.FACTURA_COMERCIAL,
      num: exp.factura_comercial,
      issuer: nombreSuplidor || cli.nombre || broker.brokerName,
    });
  }
  if (exp.numero_vuce && maps?.vuceDocCode) {
    docs.push({
      code: maps.vuceDocCode,
      num: exp.numero_vuce,
      issuer: "VENTANILLA UNICA DE COMERCIO EXTERIOR",
    });
  }

  // Los documentos sin código RDOC hacen fallar la carga en SIGA: se omiten.
  const documentos = docs.filter((d) => d.code).map((d) => {
    const issuer = d.issuer || broker.brokerName;
    // Los datos de contacto configurados son los de la agencia: solo se emiten
    // cuando el emisor del documento es la propia agencia.
    const esAgencia = normNombre(issuer) === normNombre(broker.brokerName);
    return `  <ImpDeclarationDocument>
${T("RequiredDocumentCode", d.code, "   ")}
${T("OtherDocTypeDesc", "", "   ")}
${T("RequiredDocumentNo", d.num, "   ")}
${T("BizDocIssuerName", issuer, "   ")}
${T("BizDocIssuerEmail", esAgencia ? mail : "", "   ")}
${T("BizDocIssuerTel", esAgencia ? tel : "", "   ")}
  </ImpDeclarationDocument>`;
  }).join("\n");

  return `<ImportDUA xmlns="http://aduanas.gob.do/XSD/ImportClearance/ImportDUA.xsd">
 <ImpDeclaration xmlns="">
${cabecera}
${supplier}
${productos}${documentos ? "\n" + documentos : ""}
</ImpDeclaration>
</ImportDUA>
`;
}


// ===== Declaración de Exportación (ExportDUA) =====
// Reutiliza los mismos helpers del generador de Importación.
// Campos aún sin origen en el Expediente: BondedArea, DestinationCountry,
// VoyageNo y ContainerPlate → se emiten vacíos hasta definir su captura.
export function buildExportDUAXml(
  exp: any,
  items: any[],
  broker: BrokerConfig,
  maps?: SigaMaps,
): string {
  // En una Exportación el Cliente es el Exportador
  const cliente = exp.clientes ?? {};
  const nat = broker.defaultNationality || "214";
  const exporterCode = personCode(cliente.rnc, nat);
  const origen = exp.pais_origen_codigo ?? "";

  const T = (name: string, value: unknown, indent = "  ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const cabecera = [
    T("DeclarationDate", fmtDate(exp.fecha_recibido)),
    T("ClearanceType", broker.clearanceType),
    T("AreaCode", exp.area_aduanera_codigo),
    T("FormNo", ""),
    T("BLNo", exp.bl_awb),
    T("BondedArea", ""),
    T("TransportCompany", broker.transportCompanyCode),
    T("TransportCompanynationality", broker.transportNationality || nat),
    T("TransportMethod", resolveTransportMethodCode(exp, maps?.transporte)),
    T("DeparturePort", exp.puerto_salida_codigo),
    T("DestinationCountry", ""),
    T("VoyageNo", ""),
    T("ExporterCode", exporterCode),
    T("ExporterName", cliente.nombre),
    T("ExporterNationality", nat),
    T("BuyerCode", exp.buyer_codigo),
    T("BuyerName", exp.buyer_nombre),
    T("BuyerNationality", exp.buyer_nacionalidad || nat),
    T("BrokerCompanyCode", personCode(broker.brokerCompanyCode, nat)),
    T("BrokerEmployeeCode", broker.brokerEmployeeCode),
    T("DeclarantCode", cleanId(exp.declarante_codigo || broker.declarantCode)),
    T("DeclarantName", exp.declarante_nombre || broker.declarantName),
    T("DeclarantNationality", migrarNat(exp.declarante_nacionalidad || broker.declarantNationality, nat)),
    T("InsuranceValue", num(exp.seguro)),
    T("RegimenCode", resolveRegimenCode(exp, maps?.regimen)),
    T("AgreementCode", resolveAgreementCode(exp, maps?.acuerdo)),
    T("TotalFOB", num(exp.total_fob)),
    T("NetWeight", num(exp.peso_neto ?? exp.peso_bruto)),
    T("FreightValue", num(exp.flete)),
    T("OtherValue", num(exp.otros)),
    T("TotalCIF", num(exp.total_cif)),
    T("TotalWeight", num(exp.peso_bruto)),
    T("Remark", exp.observaciones),
    T("SZCIFValue", num(exp.zf_valor_cif)),
    T("SZMaterialsValue", num(exp.zf_valor_materiales)),
    T("SZSalaryValue", num(exp.zf_valor_salario)),
    T("SZServiceValue", num(exp.zf_valor_servicio)),
    T("SZOthersValue", num(exp.zf_otros_valores)),
  ].join("\n");

  const productos = (items ?? []).map((it) => `  <ExpDeclarationProduct>
${T("HSCode", String(it.codigo_arancelario ?? "").replace(/\D/g, ""), "   ")}
${T("ProductCode", it.product_code, "   ")}
${T("BrandCode", it.brand_code || it.cod_marca || "NA", "   ")}
${T("BrandName", it.brand_name || it.marca || "N/A", "   ")}
${T("ModelCode", it.model_code || it.cod_modelo || "NA", "   ")}
${T("ModelName", it.model_name || it.modelo || "N/A", "   ")}
${T("ProductStatusCode", it.product_status_code || it.estado_producto_codigo || ESTADO_PRODUCTO_NUEVO, "   ")}
${T("ProductYear", it.product_year ?? "", "   ")}
${T("FOBValue", unitFob(it.valor_fob, it.cantidad), "   ")}
${T("UnitCode", it.unidad_codigo, "   ")}
${T("Qty", num(it.cantidad), "   ")}
${T("Weight", num(it.peso), "   ")}
${T("ProductSpecification", it.especificaciones || it.detalle_producto, "   ")}
${T("TempProductYN", "false", "   ")}
${T("CertificateOrignYN", it.tiene_certificado_origen ? "true" : "false", "   ")}
${T("CertificateOriginNo", it.certificado_origen_numero, "   ")}
${T("OriginCountry", it.pais_origen_codigo || origen, "   ")}
${T("OrganicYN", it.es_organico ? "true" : "false", "   ")}
${T("GradeAlcohol", num(it.grado_alcohol) || "0", "   ")}
${T("ProductDescription", it.detalle_producto, "   ")}
${T("Remark", it.detalle_producto, "   ")}
  </ExpDeclarationProduct>`).join("\n");

  // Documentos: misma lógica que en Importación (BL, Factura, VUCE)
  const cli = exp.clientes ?? {};
  const tel = (broker.brokerTel ?? "").trim();
  const mail = (broker.brokerEmail ?? "").trim();
  const nombreSuplidor = (exp.suplidor || "").trim();
  const nombreNaviera = (exp.naviera || "").trim();

  const docs: Array<{ code: string; num: string; issuer: string }> = [];
  if (exp.bl_awb) {
    docs.push({
      code: RDOC.BL_MANIFIESTO,
      num: exp.bl_awb,
      issuer: nombreNaviera || nombreSuplidor || cli.nombre || broker.brokerName,
    });
  }
  if (exp.factura_comercial) {
    docs.push({
      code: RDOC.FACTURA_COMERCIAL,
      num: exp.factura_comercial,
      issuer: nombreSuplidor || cli.nombre || broker.brokerName,
    });
  }
  if (exp.numero_vuce && maps?.vuceDocCode) {
    docs.push({
      code: maps.vuceDocCode,
      num: exp.numero_vuce,
      issuer: "VENTANILLA UNICA DE COMERCIO EXTERIOR",
    });
  }

  const documentos = docs.filter((d) => d.code).map((d) => {
    const issuer = d.issuer || broker.brokerName;
    const esAgencia = normNombre(issuer) === normNombre(broker.brokerName);
    return `  <ExpDeclarationDocument>
${T("RequiredDocumentCode", d.code, "   ")}
${T("OtherDocTypeDesc", "", "   ")}
${T("RequiredDocumentNo", d.num, "   ")}
${T("BizDocIssuerName", issuer, "   ")}
${T("BizDocIssuerEmail", esAgencia ? mail : "", "   ")}
${T("BizDocIssuerTel", esAgencia ? tel : "", "   ")}
  </ExpDeclarationDocument>`;
  }).join("\n");

  const listaContenedores: any[] = exp.contenedoresData ?? exp.contenedores ?? [];
  const contenedores = listaContenedores
    .filter((c: any) => (c?.numero_contenedor ?? c?.numero ?? "").toString().trim())
    .map((c: any) => `  <ExpDeclarationContainer>
${T("ContainerType", c.tipo_contenedor ?? c.tipo, "   ")}
${T("ContainerNo", c.numero_contenedor ?? c.numero, "   ")}
${T("SealNo1", c.sello1, "   ")}
${T("SealNo2", c.sello2, "   ")}
${T("ContainerPlate", "", "   ")}
  </ExpDeclarationContainer>`).join("\n");

  return `<ExportDUA xmlns="http://aduanas.gob.do/XSD/ExportClearance/ExportDUA.xsd">
 <ExpDeclaration xmlns="">
${cabecera}
${productos}${documentos ? "\n" + documentos : ""}${contenedores ? "\n" + contenedores : ""}
</ExpDeclaration>
</ExportDUA>
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

// ===== Manifiesto de Importación (ImportManifest-01-2023.xsd) =====
// Documento de carga del buque/vuelo presentado por la naviera/consolidador.
// Distinto del ImportDUA (declaración de nacionalización).
// Se omite por completo la sección ManifestVehicle (no aplica al negocio).

export type ManifiestoOperacion = any;
export type ManifiestoContenedor = {
  operacion_logistica_id?: string | null;
  numero_contenedor?: string | null;
  sello1?: string | null;
  sello2?: string | null;
  tipo_contenedor?: string | null;
  placa?: string | null;
  cantidad?: number | null;
  peso_bruto?: number | null;
  peso_neto?: number | null;
};

const TIPO_TRANSPORTE_MANIFIESTO: Record<string, string> = {
  maritimo: "IG1007-S",
  aereo: "IG1007-A",
  terrestre: "IG1007-T",
};

/** Código SIGA de tipo de transporte de una operación logística */
export function resolveManifestTransportType(op: any): string {
  if (op?.transport_type_code) return String(op.transport_type_code);
  const t = normNombre(op?.tipo);
  return TIPO_TRANSPORTE_MANIFIESTO[t] ?? "";
}

function blNoDe(op: any): string {
  return op?.bl_hijo_numero || op?.bl_awb || "";
}

/** Campos obligatorios del manifiesto SIGA: advierten, no bloquean. */
export function validarManifiesto(ops: ManifiestoOperacion[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const need = (cond: any, field: string, label: string) => { if (!cond) issues.push({ field, label }); };
  const head = ops[0] ?? {};
  need(ops.length > 0, "ops", "Al menos una operación logística");
  need(head.area_code, "area_code", "Código de Administración (AreaCode)");
  need(resolveManifestTransportType(head), "transport_type", "Tipo de transporte (TransportType)");
  need(head.biz_company_code, "biz_company_code", "Código SIGA de la naviera/consolidador (BizCompanyCode)");
  need(head.buque, "buque", "Buque / Vuelo (VesselCode)");
  need(head.voyage, "voyage", "Número de viaje (VoyageNo)");
  need(head.origen, "origen", "Puerto/lugar de carga (LoadingLocationCode)");
  need(head.puerto_descarga || head.puerto_destino, "puerto_descarga", "Puerto de descarga (UnloadingLocationCode)");
  need(head.fecha_salida, "fecha_salida", "Fecha de salida (DepartureDate)");
  need(head.eta || head.fecha_arribo, "eta", "Fecha de arribo (ArrivalDate)");
  ops.forEach((op, i) => {
    const et = `Operación ${op?.numero ?? i + 1}`;
    need(blNoDe(op), `bl[${i}].no`, `${et}: número de BL`);
    need(op?.bl_type, `bl[${i}].type`, `${et}: tipo de BL (BLType)`);
    need(op?.transit_type, `bl[${i}].transit`, `${et}: tipo de tránsito (TransitType)`);
    need(op?.producto, `bl[${i}].goods`, `${et}: descripción de la mercancía`);
    need(op?.cantidad_bultos != null, `bl[${i}].qty`, `${et}: cantidad de bultos`);
    need(op?.peso_bruto_kg != null, `bl[${i}].weight`, `${et}: peso bruto`);
    need(op?.shipper_nombre, `bl[${i}].consignor`, `${et}: nombre del consignador`);
    need(op?.comprador_nombre, `bl[${i}].consignee`, `${et}: nombre del consignatario`);
  });
  return issues;
}

export function buildImportManifestXml(
  ops: ManifiestoOperacion[],
  contenedores: ManifiestoContenedor[],
  broker: BrokerConfig,
): string {
  const head = ops[0] ?? {};
  const nat = broker.defaultNationality || "214";
  const T = (name: string, value: unknown, indent = "  ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const cabecera = [
    T("AreaCode", head.area_code),
    T("TransportType", resolveManifestTransportType(head)),
    T("BizCompanyCode", head.biz_company_code),
    T("VesselCode", head.buque),
    T("VoyageNo", head.voyage),
    T("EmptyYN", head.empty_yn ? "true" : "false"),
    T("LoadingLocationCode", head.loading_location_code || head.origen),
    T("UnloadingLocationCode", head.unloading_location_code || head.puerto_descarga || head.puerto_destino),
    T("ViaEntrance", head.via_entrance),
    T("DepartureDate", fmtDate(head.fecha_salida)),
    T("ArrivalDate", fmtDate(head.eta || head.fecha_arribo)),
    T("CountryCode", head.country_code),
  ].join("\n");

  const parte = (op: any, pre: "Consignor" | "Consignee" | "Notify") => parteManifiesto(op, pre, nat);

  const bls = ops
    .map((op) =>
      [
        "    <ManifestBL>",
        T("BLNo", blNoDe(op), "      "),
        T("BLType", op.bl_type, "      "),
        T("TransitType", op.transit_type, "      "),
        T("LastPortCode", op.via_entrance || op.origen, "      "),
        T("LoadingPortCode", op.loading_location_code || op.origen, "      "),
        T("GoodsName", op.producto, "      "),
        T("PackageUnitCode", op.tipo_bultos, "      "),
        T("PackageQty", num(op.cantidad_bultos), "      "),
        T("GrossWeight", num(op.peso_bruto_kg), "      "),
        T("Value", num(op.flete_monto), "      "),
        T("FlightCharge", num(op.flete_monto), "      "),
        T("Volume", num(op.volumen_m3), "      "),
        T("ExpressType", op.express_type, "      "),
        T("DangerousGoodsType", op.es_mercancia_peligrosa ? "true" : "false", "      "),
        parte(op, "Consignor"),
        parte(op, "Consignee"),
        parte(op, "Notify"),
        "    </ManifestBL>",
      ].join("\n"),
    )
    .join("\n");

  const conts = contenedores.filter((c) => (c.numero_contenedor ?? "").toString().trim());
  const contenedoresXml = conts
    .map((c) =>
      [
        "    <ManifestContainer>",
        T("ContainerNo", c.numero_contenedor, "      "),
        T("PlacaNo", c.placa ?? "", "      "),
        T("ContainerType", c.tipo_contenedor, "      "),
        T("PackageCode", "", "      "),
        T("Amount", num(c.cantidad ?? 0), "      "),
        T("GrossWeight", num(c.peso_bruto ?? 0), "      "),
        T("NetWeight", num(c.peso_neto ?? 0), "      "),
        T("SealNo1", c.sello1, "      "),
        T("SealNo2", c.sello2, "      "),
        "    </ManifestContainer>",
      ].join("\n"),
    )
    .join("\n");

  const contenedorBl = conts
    .map((c) => {
      const op = ops.find((o) => o.id === c.operacion_logistica_id) ?? head;
      return [
        "    <ContainerBL>",
        T("ContainerNo", c.numero_contenedor, "      "),
        T("BLNo", blNoDe(op), "      "),
        "    </ContainerBL>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ImportManifest xmlns="http://aduanas.gob.do/XSD/ImportManifest/ImportManifest-01-2023.xsd">
  <Manifest>
${cabecera}
${bls}
${contenedoresXml}
${contenedorBl}
  </Manifest>
</ImportManifest>
`;
}

/** Bloque Consignador/Consignatario/Notify compartido por los manifiestos SIGA. */
function parteManifiesto(op: any, pre: "Consignor" | "Consignee" | "Notify", nat: string): string {
  const T = (name: string, value: unknown, indent = "      ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;
  const g = (k: string) => op?.[`${pre.toLowerCase()}_${k}`];
  const base =
    pre === "Consignor"
      ? { nombre: op?.shipper_nombre, tel: op?.shipper_telefono, email: op?.shipper_email, calle: op?.shipper_direccion, doc: op?.shipper_tax_id }
      : pre === "Consignee"
        ? { nombre: op?.comprador_nombre, tel: op?.comprador_telefono, email: op?.comprador_email, calle: op?.comprador_direccion, doc: op?.comprador_tax_id }
        : { nombre: op?.notify_nombre || op?.notify_party, tel: op?.notify_telefono, email: op?.notify_email, calle: op?.notify_calle, doc: op?.notify_doc_numero };
  return [
    T(`${pre}Type`, g("tipo")),
    T(`${pre}Code`, personCode(g("doc_numero") || base.doc, g("pais") || nat)),
    T(`${pre}Tel`, base.tel),
    T(`${pre}CountryCode`, g("pais")),
    T(`${pre}Name`, base.nombre),
    T(`${pre}DocumentType`, g("doc_tipo")),
    T(`${pre}DocumentNo`, cleanId(g("doc_numero") || base.doc)),
    T(`${pre}Email`, base.email),
    T(`${pre}Fax`, g("fax")),
    T(`${pre}ZipCode`, g("zip")),
    T(`${pre}Street`, g("calle") || base.calle),
    T(`${pre}ZoneName`, g("zona")),
    T(`${pre}City`, g("ciudad")),
  ].join("\n");
}

// ===== Manifiesto Consolidado de Importación (ImportConsolidatedMaster.xsd) =====
// BL Madre del consolidador/NVOCC + los BL Hijos emitidos por ADECOMEX.
// Se omite por completo ManifestVehicle (no aplica al negocio).

/** Número de BL Hijo (HouseBLNo) de una operación logística. */
export function houseBlNoDe(op: any): string {
  return op?.bl_hijo_numero || "";
}

/** Campos obligatorios del manifiesto consolidado: advierten, no bloquean. */
export function validarManifiestoConsolidado(ops: ManifiestoOperacion[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const need = (cond: any, field: string, label: string) => { if (!cond) issues.push({ field, label }); };
  const head = ops[0] ?? {};
  need(ops.length > 0, "ops", "Al menos una operación logística");
  need(head.manifiesto_no, "manifiesto_no", "Número de manifiesto SIGA (ManifestNo)");
  need(head.bl_awb, "bl_awb", "BL Madre del consolidador (BLNo)");
  ops.forEach((op, i) => {
    const et = `Operación ${op?.numero ?? i + 1}`;
    need(houseBlNoDe(op), `hbl[${i}].no`, `${et}: número de BL Hijo (HouseBLNo)`);
    need(op?.transit_type, `hbl[${i}].transit`, `${et}: tipo de tránsito (TransitType)`);
    need(op?.loading_location_code || op?.origen, `hbl[${i}].port`, `${et}: puerto de carga (LoadingPortCode)`);
    need(op?.producto, `hbl[${i}].goods`, `${et}: descripción de la mercancía`);
    need(op?.cantidad_bultos != null, `hbl[${i}].qty`, `${et}: cantidad de bultos`);
    need(op?.peso_bruto_kg != null, `hbl[${i}].weight`, `${et}: peso bruto`);
    need(op?.shipper_nombre, `hbl[${i}].consignor`, `${et}: nombre del consignador`);
    need(op?.comprador_nombre, `hbl[${i}].consignee`, `${et}: nombre del consignatario`);
  });
  return issues;
}

export function buildImportConsolidatedMasterXml(
  ops: ManifiestoOperacion[],
  contenedores: ManifiestoContenedor[],
  broker: BrokerConfig,
): string {
  const head = ops[0] ?? {};
  const nat = broker.defaultNationality || "214";
  const T = (name: string, value: unknown, indent = "    ") =>
    `${indent}<${name}>${value === null || value === undefined ? "" : esc(value)}</${name}>`;

  const bls = ops
    .map((op) =>
      [
        "    <ManifestBL>",
        T("HouseBLNo", houseBlNoDe(op), "      "),
        T("TransitType", op.transit_type, "      "),
        T("LastPortCode", op.via_entrance || "", "      "),
        T("LoadingPortCode", op.loading_location_code || op.origen, "      "),
        T("GoodsName", op.producto, "      "),
        T("PackageUnitCode", op.tipo_bultos, "      "),
        T("PackageQty", num(op.cantidad_bultos), "      "),
        T("GrossWeight", num(op.peso_bruto_kg), "      "),
        T("Value", num(op.flete_monto), "      "),
        T("FlightCharge", num(op.flete_monto), "      "),
        T("Volume", num(op.volumen_m3), "      "),
        T("ExpressType", op.express_type, "      "),
        parteManifiesto(op, "Consignor", nat),
        parteManifiesto(op, "Consignee", nat),
        parteManifiesto(op, "Notify", nat),
        "    </ManifestBL>",
      ].join("\n"),
    )
    .join("\n");

  const conts = contenedores.filter((c) => (c.numero_contenedor ?? "").toString().trim());
  const contenedorBl = conts
    .map((c) => {
      const op = ops.find((o) => o.id === c.operacion_logistica_id) ?? head;
      return [
        "    <ContainerBL>",
        T("HouseBLNo", houseBlNoDe(op), "      "),
        T("ContainerNo", c.numero_contenedor, "      "),
        "    </ContainerBL>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ImportConsolidateMaster xmlns="http://aduanas.gob.do/XSD/ImportConsolidatedMaster/ImportConsolidatedMaster.xsd">
  <ConsolidatedBL>
${T("ManifestNo", head.manifiesto_no)}
${T("BLNo", head.bl_awb)}
${bls}
${contenedorBl}
  </ConsolidatedBL>
</ImportConsolidateMaster>
`;
}
