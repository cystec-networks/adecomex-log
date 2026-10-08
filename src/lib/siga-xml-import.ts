// Lectura inversa de un XML DUA de SIGA (ImportDUA / ExportDUA).
// Usa exactamente las mismas etiquetas y convenciones que buildImportDUAXml /
// buildExportDUAXml (siga-xml.ts): códigos de persona RNC+país+número, FOB
// unitario por línea, comodines "NA"/"N/A", suplidor "NO ASIGNADO", etc.
import { SUPPLIER_NO_ASIGNADO, RDOC } from "./siga-xml";

export type XmlDuaProducto = {
  codigo_arancelario: string;
  product_code: string;
  detalle_producto: string;
  cod_marca: string;
  marca: string;
  cod_modelo: string;
  modelo: string;
  estado_producto_codigo: string;
  unidad_codigo: string;
  cantidad: number | null;
  peso: number | null;
  valor_fob: number | null;
  especificaciones: string;
  tiene_certificado_origen: boolean;
  certificado_origen_numero: string;
  pais_origen_codigo: string;
};

export type XmlDuaContenedor = { numero: string; sello1: string; sello2: string; tipo: string };

export type XmlDuaResultado = {
  tipo: "Importación" | "Exportación";
  /** true si trae el namespace oficial de la DGA (XML propio o estándar). */
  namespaceOficial: boolean;
  clienteRnc: string;
  clienteNombre: string;
  /** Valores crudos (códigos DGA) listos para resolver contra catálogos. */
  campos: {
    area_aduanera_codigo: string;
    bl_awb: string;
    factura_comercial: string;
    puerto_arribo_codigo: string;
    puerto_salida_codigo: string;
    pais_procedencia_codigo: string;
    pais_origen_codigo: string;
    metodo_transporte_codigo: string;
    regimen_codigo: string;
    acuerdo_codigo: string;
    fecha_compromiso: string;
    fecha_recibido: string;
    total_fob: number | null;
    seguro: number | null;
    flete: number | null;
    otros: number | null;
    total_cif: number | null;
    peso_bruto: number | null;
    peso_neto: number | null;
    observaciones: string;
    suplidor: string;
    suplidor_rnc: string;
    naviera: string;
    numero_vuce: string;
    buyer_codigo: string;
    buyer_nombre: string;
    buyer_nacionalidad: string;
    declarante_codigo: string;
    declarante_nombre: string;
    declarante_nacionalidad: string;
    zf_valor_cif: number | null;
    zf_valor_materiales: number | null;
    zf_valor_salario: number | null;
    zf_valor_servicio: number | null;
    zf_otros_valores: number | null;
  };
  productos: XmlDuaProducto[];
  contenedores: XmlDuaContenedor[];
  advertencias: string[];
};

export class XmlDuaError extends Error {}

/** Inversa de personCode(): "RNC214130594181" → "130594181". */
function idDesdePersonCode(code: string, countryCode = "214"): string {
  let c = String(code ?? "").trim().toUpperCase();
  if (!c) return "";
  const m = /^(RNC|CED|PAS|TID|TAX)(.*)$/.exec(c);
  if (m) c = m[2];
  if (countryCode && c.startsWith(countryCode) && c.length > countryCode.length + 5) c = c.slice(countryCode.length);
  return c;
}

const vacio = (v: string) => (v === "NA" || v === "N/A" ? "" : v);

function fecha(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function numero(v: string): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

/** Lee el texto de una etiqueta hija directa (sin importar namespace ni mayúsculas). */
function hijo(el: Element, name: string): string {
  const low = name.toLowerCase();
  for (const c of Array.from(el.children)) {
    if (c.localName.toLowerCase() === low) return (c.textContent ?? "").trim();
  }
  return "";
}

function hijos(el: Element, name: string): Element[] {
  const low = name.toLowerCase();
  return Array.from(el.children).filter((c) => c.localName.toLowerCase() === low);
}

export function parsearXmlDua(texto: string): XmlDuaResultado {
  if (!texto || !texto.trim()) throw new XmlDuaError("El archivo está vacío.");
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(texto.replace(/^\uFEFF/, ""), "application/xml");
  } catch {
    throw new XmlDuaError("El archivo no es un XML válido.");
  }
  if (doc.getElementsByTagName("parsererror").length) {
    throw new XmlDuaError("El archivo XML está mal formado (no se pudo leer su estructura).");
  }
  const root = doc.documentElement;
  const rootName = root.localName;
  const esImp = rootName === "ImportDUA" || !!Array.from(root.children).find((c) => c.localName === "ImpDeclaration");
  const esExp = rootName === "ExportDUA" || !!Array.from(root.children).find((c) => c.localName === "ExpDeclaration");
  const decl =
    rootName === "ImpDeclaration" || rootName === "ExpDeclaration"
      ? root
      : Array.from(root.children).find((c) => c.localName === "ImpDeclaration" || c.localName === "ExpDeclaration");
  if (!decl || (!esImp && !esExp && rootName !== "ImpDeclaration" && rootName !== "ExpDeclaration")) {
    throw new XmlDuaError(
      `El formato no es compatible: se esperaba una declaración DUA de SIGA (ImportDUA o ExportDUA) y el archivo trae "${rootName}".`,
    );
  }
  const imp = decl.localName === "ImpDeclaration";
  const pre = imp ? "Imp" : "Exp";
  const ns = root.namespaceURI ?? "";
  const namespaceOficial = /aduanas\.gob\.do\/XSD\/(Import|Export)Clearance/i.test(ns);
  const advertencias: string[] = [];
  if (!namespaceOficial) advertencias.push("El XML no trae el identificador oficial de la DGA; se leyó con tolerancia.");

  const g = (n: string) => hijo(decl, n);
  const nat = "214";

  const clienteCode = imp ? g("ImporterCode") || g("ConsigneeCode") : g("ExporterCode");
  const clienteNombre = imp ? g("ImporterName") || g("ConsigneeName") : g("ExporterName");

  // Suplidor (solo importación)
  let suplidor = "";
  let suplidorRnc = "";
  const sup = hijos(decl, `${pre}DeclarationSupplier`)[0];
  if (sup) {
    const code = hijo(sup, "ForeignSupplierCode");
    const name = hijo(sup, "ForeignSupplierName");
    if (code && code !== SUPPLIER_NO_ASIGNADO.code) {
      suplidorRnc = idDesdePersonCode(code, hijo(sup, "ForeignSupplierNationality"));
    }
    if (name && name !== SUPPLIER_NO_ASIGNADO.name) suplidor = name;
  }

  // Documentos: BL → emisor = naviera; Factura; otro con emisor VUCE → permiso
  let naviera = "";
  let numeroVuce = "";
  let blDoc = "";
  let facDoc = "";
  for (const d of hijos(decl, `${pre}DeclarationDocument`)) {
    const code = hijo(d, "RequiredDocumentCode");
    const no = hijo(d, "RequiredDocumentNo");
    const issuer = hijo(d, "BizDocIssuerName");
    if (code === RDOC.BL_MANIFIESTO) {
      blDoc = no;
      if (issuer && issuer !== suplidor && issuer !== clienteNombre) naviera = issuer;
    } else if (code === RDOC.FACTURA_COMERCIAL) {
      facDoc = no;
    } else if (/VENTANILLA UNICA/i.test(issuer)) {
      numeroVuce = no;
    }
  }

  const productos: XmlDuaProducto[] = hijos(decl, `${pre}DeclarationProduct`).map((p) => {
    const q = numero(hijo(p, "Qty"));
    const unit = numero(hijo(p, "FOBValue"));
    const total = unit != null ? (q ? Math.round(unit * q * 100) / 100 : unit) : null;
    const desc = hijo(p, "ProductDescription") || hijo(p, "productname") || hijo(p, "Remark");
    const cert = hijo(p, "CertificateOrignYN").toLowerCase() === "true";
    return {
      codigo_arancelario: hijo(p, "HSCode"),
      product_code: hijo(p, "ProductCode"),
      detalle_producto: desc,
      cod_marca: vacio(hijo(p, "BrandCode")),
      marca: vacio(hijo(p, "BrandName")),
      cod_modelo: vacio(hijo(p, "ModelCode")),
      modelo: vacio(hijo(p, "ModelName")),
      estado_producto_codigo: hijo(p, "ProductStatusCode"),
      unidad_codigo: hijo(p, "UnitCode"),
      cantidad: q,
      peso: numero(hijo(p, "Weight")),
      valor_fob: total,
      especificaciones: hijo(p, "ProductSpecification") === desc ? "" : hijo(p, "ProductSpecification"),
      tiene_certificado_origen: cert,
      certificado_origen_numero: cert ? hijo(p, "CertificateOriginNo") : "",
      pais_origen_codigo: hijo(p, "OriginCountry"),
    };
  });

  const contenedores: XmlDuaContenedor[] = hijos(decl, `${pre}DeclarationContainer`)
    .map((c) => ({
      numero: hijo(c, "ContainerNo"),
      sello1: hijo(c, "SealNo1"),
      sello2: hijo(c, "SealNo2"),
      tipo: hijo(c, "ContainerType"),
    }))
    .filter((c) => c.numero);

  // País de origen del expediente: el más común entre las líneas.
  const cuenta = new Map<string, number>();
  for (const p of productos) if (p.pais_origen_codigo) cuenta.set(p.pais_origen_codigo, (cuenta.get(p.pais_origen_codigo) ?? 0) + 1);
  const paisOrigen = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  if (!productos.length) advertencias.push("El XML no trae líneas de mercancía.");

  return {
    tipo: imp ? "Importación" : "Exportación",
    namespaceOficial,
    clienteRnc: idDesdePersonCode(clienteCode, nat),
    clienteNombre,
    campos: {
      area_aduanera_codigo: g("AreaCode"),
      bl_awb: g("BLNo") || blDoc,
      factura_comercial: g("CommercialInvoiceno") || facDoc,
      puerto_arribo_codigo: imp ? g("EntryPort") || g("DestinationLocationCode") : "",
      puerto_salida_codigo: imp ? "" : g("DeparturePort"),
      pais_procedencia_codigo: imp ? g("DepartureCountryCode") : "",
      pais_origen_codigo: paisOrigen,
      metodo_transporte_codigo: g("TransportMethod"),
      regimen_codigo: g("RegimenCode"),
      acuerdo_codigo: g("AgreementCode"),
      fecha_compromiso: fecha(g("EntryPlanDate")),
      fecha_recibido: imp ? "" : fecha(g("DeclarationDate")),
      total_fob: numero(g("TotalFOB")),
      seguro: numero(g("InsuranceValue")),
      flete: numero(g("FreightValue")),
      otros: numero(g("OtherValue")),
      total_cif: numero(g("TotalCIF")),
      peso_bruto: numero(g("TotalWeight")),
      peso_neto: numero(g("NetWeight")),
      observaciones: g("Remark"),
      suplidor,
      suplidor_rnc: suplidorRnc,
      naviera,
      numero_vuce: numeroVuce,
      buyer_codigo: imp ? "" : g("BuyerCode"),
      buyer_nombre: imp ? "" : g("BuyerName"),
      buyer_nacionalidad: imp ? "" : g("BuyerNationality"),
      declarante_codigo: imp ? "" : g("DeclarantCode"),
      declarante_nombre: imp ? "" : g("DeclarantName"),
      declarante_nacionalidad: imp ? "" : g("DeclarantNationality"),
      zf_valor_cif: imp ? null : numero(g("SZCIFValue")),
      zf_valor_materiales: imp ? null : numero(g("SZMaterialsValue")),
      zf_valor_salario: imp ? null : numero(g("SZSalaryValue")),
      zf_valor_servicio: imp ? null : numero(g("SZServiceValue")),
      zf_otros_valores: imp ? null : numero(g("SZOthersValue")),
    },
    productos,
    contenedores,
    advertencias,
  };
}
