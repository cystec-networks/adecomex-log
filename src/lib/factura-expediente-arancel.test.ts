import { it } from "node:test";
import assert from "node:assert/strict";
import { prepararProductosFactura, type LineaFacturaExpediente } from "./factura-expediente-arancel";
const linea: LineaFacturaExpediente = { descripcion: "CHOOZIT MA 11", codigo_arancelario: null, cantidad: 5, unidad: "DCU", valor_fob: 100, peso: 2 };
const tasas = async () => ({ pct_gravamen: "0", aplica_isc: false, pct_isc: "", pct_itbis: "0" });
it("precarga 3002.90.10 solo desde un candidato confiable del motor compartido", async () => {
  const [p] = await prepararProductosFactura([linea], async () => ({ resultados: [{ producto: true, arancel: { codigo: "3002.90.10" } }] }), tasas);
  assert.equal(p.codigo_arancelario, "3002.90.10"); assert.equal(p.codigo_sugerido_ia, "3002.90.10");
  assert.equal(p.pct_gravamen, 0); assert.equal(p.valor_fob, 100); assert.equal(p.cantidad, 5);
});
it("no clasifica ni marca códigos extraídos del documento", async () => {
  const [p] = await prepararProductosFactura([{ ...linea, codigo_arancelario: "0703.10.11" }], async () => { throw new Error("No debe llamarse"); }, tasas);
  assert.equal(p.codigo_arancelario, "0703.10.11"); assert.equal(p.codigo_sugerido_ia, null);
});
it("sin candidato seguro o sin producto deja código vacío, sin tomar alternativas", async () => {
  const ps = await prepararProductosFactura([linea, { ...linea, descripcion: "PORTES SEGURO" }], async () => ({ resultados: [{ producto: true, arancel: null }, { producto: false, arancel: null }] }), tasas);
  assert.deepEqual(ps.map(p => p.codigo_arancelario), [null, null]);
});
it("un fallo de sugerencia conserva la descripción OCR y sus montos", async () => {
  const [p] = await prepararProductosFactura([linea], async () => { throw new Error("Sin conexión"); }, tasas);
  assert.equal(p.codigo_arancelario, null); assert.equal(p.detalle_producto, "CHOOZIT MA 11"); assert.equal(p.valor_fob, 100);
});
it("no acepta un código de diez dígitos y no clasifica descripciones vacías", async () => {
  let recibidas: string[] = [];
  const ps = await prepararProductosFactura([linea, { ...linea, descripcion: "" }], async ds => { recibidas = ds; return { resultados: [{ producto: true, arancel: { codigo: "3002.40.00.00" } }] }; }, tasas);
  assert.deepEqual(recibidas, ["CHOOZIT MA 11"]); assert.deepEqual(ps.map(p => p.codigo_arancelario), [null, null]);
});