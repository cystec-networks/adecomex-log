import { test } from "node:test";
import assert from "node:assert/strict";
import { acumularValoresFactura, leerDesglosesCif, normalizarFacturaCif } from "./factura-comercial-cif";
import { agregarProductosFactura, prepararProductosFactura } from "./factura-expediente-arancel";

const texto = "Desglose de Valores CIF:\nCosto: $38,973.30\nSeguro: $151.70\nFlete: $1,875.00\nTotal CIF: $41,000.00";
const factura = {
  fob_total: 41000, seguro: null, flete: null,
  lineas_factura: [{ descripcion: "PRODUCTO BASF", codigo_arancelario: null, codigo_producto_documento: "3466100999900", cantidad: 20000, unidad: "KG", peso: 20000, valor_fob: 41000 }],
};
test("FOB de BASF usa Costo 38973.30, nunca Importe Total CIF 41000", () => {
  const r = normalizarFacturaCif(factura, leerDesglosesCif(texto));
  assert.equal(r.fob_total, 38973.30);
  assert.equal(r.lineas_factura[0].valor_fob, 38973.30);
});
test("Seguro y Flete proceden del desglose explícito", () => {
  const r = normalizarFacturaCif(factura, leerDesglosesCif(texto));
  assert.equal(r.seguro, 151.70);
  assert.equal(r.flete, 1875);
});
test("dos facturas BASF consolidan 40000 Kg y FOB 77946.60", async () => {
  const r = normalizarFacturaCif(factura, leerDesglosesCif(texto));
  const productos = await prepararProductosFactura(r.lineas_factura, async () => ({ resultados: [] }), async () => ({ pct_gravamen: "0", aplica_isc: false, pct_isc: "0", pct_itbis: "0" }));
  const suma = agregarProductosFactura(productos, productos);
  assert.equal(suma.length, 1);
  assert.equal(suma[0].cantidad, 40000);
  assert.equal(suma[0].peso, 40000);
  assert.equal(suma[0].valor_fob, 77946.60);
  assert.equal(suma[0].codigo_arancelario, null);
  const cargos = { total_fob: r.fob_total, seguro: r.seguro, flete: r.flete };
  const acumulados = acumularValoresFactura(cargos, cargos);
  const seguro = Number(acumulados.seguro), flete = Number(acumulados.flete);
  assert.equal(Number(acumulados.total_fob), 77946.60);
  assert.equal(seguro, 303.40);
  assert.equal(flete, 3750);
  assert.equal(Number(suma[0].valor_fob) + seguro + flete, 82000);
});
test("otros productos, códigos CABYS, unidades y reglas fiscales no se fusionan", () => {
  const p = { detalle_producto: "Producto BASF", codigo_producto_documento: "3466100999900", codigo_arancelario: "12345678", unidad_medida: "KG", cantidad: 20000, peso: 20000, valor_fob: 38973.3, pct_itbis: 18 };
  assert.equal(agregarProductosFactura([p], [{ ...p, codigo_producto_documento: "3466100999901" }, { ...p, detalle_producto: "Otro producto" }, { ...p, unidad_medida: "TM" }, { ...p, codigo_arancelario: "87654321" }, { ...p, pct_itbis: 0 }]).length, 6);
});
test("OCR de escaneado también prioriza Costo explícito", () => {
  const r = normalizarFacturaCif({ ...factura, lineas_factura: factura.lineas_factura.map((l) => ({ ...l, costo_desglose_cif: 38973.3 })) });
  assert.equal(r.lineas_factura[0].valor_fob, 38973.3);
  assert.equal(r.fob_total, 38973.3);
});
test("no asigna arbitrariamente un total documental a varios productos", () => {
  const r = normalizarFacturaCif({ ...factura, lineas_factura: [factura.lineas_factura[0], { ...factura.lineas_factura[0], descripcion: "Otro" }] }, leerDesglosesCif(texto));
  assert.equal(r.lineas_factura[0].valor_fob, null);
  assert.equal(r.lineas_factura[1].valor_fob, null);
});
test("desglose inconsistente o incompleto no se impone a los datos", () => {
  assert.deepEqual(leerDesglosesCif(texto.replace("$41,000.00", "$42,000.00")), []);
  assert.deepEqual(leerDesglosesCif("Costo 38973.30 Seguro 151.70"), []);
});
test("cargos ausentes no borran anteriores; cero explícito no se inventa", () => {
  assert.deepEqual(acumularValoresFactura({ seguro: "151.7", flete: "1875" }, { seguro: null, flete: null }), {});
  assert.deepEqual(acumularValoresFactura({ seguro: "" }, { seguro: 0 }), { seguro: "0" });
});