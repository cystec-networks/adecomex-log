import { it } from "node:test";
import assert from "node:assert/strict";
import { prepararFacturasCorreo, escanearFacturaExpediente } from "./factura-expediente-escaneo";
import type { OcrExtraction } from "./ai-ocr.functions";

const extraido = { lineas_factura: [{ descripcion: "Nonfat Dry Milk", codigo_arancelario: "0402.10.90", cantidad: 56250, unidad: "KG", peso: 56250, valor_fob: 196593.75 }] } as OcrExtraction;
const archivo = { filename: "factura.pdf", mime: "application/pdf", base64: "pdf" };
const deps = {
  extraer: async (input: typeof archivo & { lineas_factura: true }) => { assert.equal(input.lineas_factura, true); return extraido; },
  clasificar: async () => { throw new Error("No reclasificar código documental"); },
  buscarTasas: async () => ({ pct_gravamen: "20", aplica_isc: false, pct_isc: "0", pct_itbis: "18" }),
};
const adjunto = { nombre: "factura.pdf", tipo: "Factura comercial", storage_path: "correo/factura.pdf" };

it("correo y escaneo manual producen las mismas mercancías, tasas y valor unitario", async () => {
  const manual = await escanearFacturaExpediente(archivo, deps);
  const correo = await prepararFacturasCorreo([adjunto], async () => archivo, deps);
  const { id: _id, ...esperado } = manual.productos_factura[0];
  const { id: _correoId, ...real } = correo[0];
  assert.deepEqual(real, esperado);
  assert.equal(real.codigo_arancelario, "0402.10.90");
  assert.equal(real.detalle_producto, "Nonfat Dry Milk");
  assert.equal(real.cantidad, 56250);
  assert.equal(real.unidad_medida, "KG");
  assert.equal(real.peso, 56250);
  assert.equal(real.valor_fob, 196593.75);
  assert.equal(Number(real.valor_fob) / Number(real.cantidad), 3.495);
  assert.equal(real.pct_gravamen, 20);
});
it("reutiliza las líneas del borrador y no duplica una factura repetida", async () => {
  const guardado = { ...adjunto, datos: extraido as unknown as Record<string, unknown> };
  const productos = await prepararFacturasCorreo([guardado, guardado], async () => { throw new Error("No descargar otra vez"); }, { ...deps, extraer: async () => { throw new Error("No OCR otra vez"); } });
  assert.equal(productos.length, 1);
  assert.equal(productos[0].valor_fob, 196593.75);
});
it("una factura sin líneas no se confirma silenciosamente", async () => {
  await assert.rejects(prepararFacturasCorreo([adjunto], async () => archivo, { ...deps, extraer: async () => ({ ...extraido, lineas_factura: [] }) }), /No se pudieron leer las mercancías/);
});
it("otros documentos no generan mercancías", async () => {
  assert.deepEqual(await prepararFacturasCorreo([{ ...adjunto, tipo: "Bill of Lading" }], async () => { throw new Error("No leer BL como factura"); }, deps), []);
});