import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textoDigitalSuficiente, tipoPorEncabezado } from "./lectura-texto";
import { costoEstimadoIa, modeloCatalogo, presupuestoBajo, topeAlcanzado } from "./ia-consumo";

describe("texto digital antes que imagen", () => {
  it("un escaneado o una página sin texto se lee como imagen", () => {
    assert.equal(textoDigitalSuficiente(["x".repeat(500), ""]), false);
    assert.equal(textoDigitalSuficiente([]), false);
    assert.equal(textoDigitalSuficiente(["COMMERCIAL INVOICE No. 2026-000123 Total USD 41,000.00 ".repeat(3)]), true);
  });
  it("un formulario con solo etiquetas (sin cifras) se lee como imagen", () => {
    assert.equal(textoDigitalSuficiente(["Exporter | Bill of Lading No | Pages\nBuyer's Reference\nConsignee\nPort of Loading | ETD\nDescription of Goods"]), false);
  });
});

describe("tipo por encabezado", () => {
  it("reconoce un título único", () => {
    assert.equal(tipoPorEncabezado("--- Página 1 ---\nACME LTD\nCOMMERCIAL INVOICE\nNo. 123"), "Factura comercial");
    assert.equal(tipoPorEncabezado("PACKING LIST\nInvoice ref 123"), "Lista de empaque");
  });
  it("ante dos títulos o documentos de pago deja decidir al modelo", () => {
    assert.equal(tipoPorEncabezado("COMMERCIAL INVOICE\nPACKING LIST"), null);
    assert.equal(tipoPorEncabezado("COMPROBANTE DE PAGO\nDGA"), null);
    assert.equal(tipoPorEncabezado("STATEMENT OF ACCOUNT\nBILL OF LADING 123"), null);
  });
  it("una etiqueta «Bill of Lading No» dentro de una factura no la convierte en BL", () => {
    assert.equal(tipoPorEncabezado("Exporter | Bill of Lading No | Pages\nExport Invoice No & Date"), null);
    assert.equal(tipoPorEncabezado("Farmel B.V.\nCERTIFICAAT VAN OORSPRONG\nCERTIFICATE OF ORIGIN\nCERTIFICADO DE ORIGEN"), "Certificado de origen");
    assert.equal(tipoPorEncabezado("MSC\nBILL OF LADING NON-NEGOTIABLE\nShipper"), "Bill of Lading");
    assert.equal(tipoPorEncabezado("MINISTERIO DE AGRICULTURA\nA U T O R I Z A C I O N\n1) Certificado de no objeción\n2) Factura Comercial."), null);
  });
});

describe("costos, topes y presupuesto", () => {
  it("costo estimado según la tarifa del modelo", () => {
    assert.equal(costoEstimadoIa("google/gemini-3.8-flash", 1530, 1263), 0.023535);
    assert.equal(costoEstimadoIa("modelo/desconocido", 1000, 1000), 0);
  });
  it("normaliza el id devuelto por el proveedor", () => {
    assert.equal(modeloCatalogo("gpt-6-astra-2026-05-01", "openai/gpt-6-astra"), "openai/gpt-6-astra");
    assert.equal(modeloCatalogo("google/gemini-3.8-flash", "google/gemini-3.8-flash"), "google/gemini-3.8-flash");
  });
  it("el tope diario se alcanza al llegar al límite; sin límite nunca", () => {
    assert.equal(topeAlcanzado(2, 2), true);
    assert.equal(topeAlcanzado(1.99, 2), false);
    assert.equal(topeAlcanzado(100, null), false);
  });
  it("alerta cuando queda menos del 20 % del presupuesto", () => {
    assert.equal(presupuestoBajo(19.9), true);
    assert.equal(presupuestoBajo(20), false);
    assert.equal(presupuestoBajo(null), false);
  });
});
