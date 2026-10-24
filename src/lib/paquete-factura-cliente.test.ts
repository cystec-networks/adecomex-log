import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { combinarFacturaCliente, fuentesFacturaCliente, correoFacturaCliente, ORDEN_FACTURA_CLIENTE } from "./paquete-factura-cliente";

describe("Paquete de Envío Factura Cliente", () => {
  const fuentes = () => fuentesFacturaCliente(ORDEN_FACTURA_CLIENTE.slice(1).map((d, i) => ({ tipo: d.tipos[0], storage_path: `${i + 1}.pdf` })), "0.pdf");
  const descargar = async (ruta: string) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100 + Number(ruta.split(".")[0]), 200]);
    return (await pdf.save()).buffer as ArrayBuffer;
  };
  it("combina exactamente las ocho fuentes en el orden solicitado sin avisos", async () => {
    const result = await combinarFacturaCliente(fuentes(), descargar);
    assert.deepEqual(result.faltantes, []);
    assert.deepEqual(result.incluidos, ["Factura de Gestión Aduanal", "Declaración Única Aduanera (DUA)", "Liquidación de Impuestos", "Recibo Pago de Impuestos", "Recibo Pago de Contenedor", "Factura Pago de Almacenaje", "Bill of Lading", "Factura Comercial"]);
    assert.ok(result.bytes);
    const pdf = await PDFDocument.load(result.bytes);
    assert.deepEqual(pdf.getPages().map((p) => p.getWidth()), [100, 101, 102, 103, 104, 105, 106, 107]);
  });
  it("sin Recibo Pago de Contenedor avisa y genera las siete fuentes restantes", async () => {
    const sources = fuentes(); sources[4].ruta = null;
    const result = await combinarFacturaCliente(sources, descargar);
    assert.deepEqual(result.faltantes, ["Recibo Pago de Contenedor"]);
    assert.ok(result.bytes);
    assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 7);
  });
  it("sin PDF de e-CF bloquea incluso con los otros siete documentos disponibles", async () => {
    const sources = fuentes(); sources[0].ruta = null;
    let descargas = 0;
    await assert.rejects(combinarFacturaCliente(sources, async (ruta) => { descargas++; return descargar(ruta); }), /falta adjuntar el PDF de la Factura de Gestión Aduanal en Finanzas/);
    assert.equal(descargas, 0);
  });
  it("sin ninguna fuente no guarda un PDF vacío", async () => {
    await assert.rejects(combinarFacturaCliente(fuentesFacturaCliente([]), descargar), /falta adjuntar el PDF/);
  });
  it("factura ilegible bloquea sin generar un paquete parcial", async () => {
    await assert.rejects(combinarFacturaCliente(fuentes(), async () => new ArrayBuffer(0)), /Factura de Gestión Aduanal no está disponible o es inválido/);
  });
  it("solo con la factura genera y avisa los siete faltantes opcionales", async () => {
    const result = await combinarFacturaCliente(fuentesFacturaCliente([], "0.pdf"), descargar);
    assert.equal(result.faltantes.length, 7);
    assert.deepEqual(result.incluidos, ["Factura de Gestión Aduanal"]);
    assert.ok(result.bytes);
    assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
  });
  it("correo selecciona contabilidad y contacto capturado", () => {
    const url = new URL(correoFacturaCliente("202609I340", { email: "cliente@example.com" }, "E310000000001"));
    assert.equal(url.searchParams.get("authuser"), "contabilidad@adecomex.com");
    assert.equal(url.searchParams.get("from"), "contabilidad@adecomex.com");
    assert.equal(url.searchParams.get("to"), "cliente@example.com");
  });
  it("correo sin contacto deja Para vacío", () => {
    assert.equal(new URL(correoFacturaCliente("202609I340", {}, "E310000000001")).searchParams.get("to"), "");
  });
  it("correo incorpora el e-NCF vinculado, el cliente y el expediente reales", () => {
    const url = new URL(correoFacturaCliente("202609I340", { nombre: "Cliente real" }, "E310000000025"));
    assert.ok(url.searchParams.get("body")?.includes("Factura No. E310000000025"));
    assert.ok(url.searchParams.get("body")?.includes("Registro # 202609I340"));
    assert.ok(url.searchParams.get("body")?.includes("Cliente real"));
  });
  it("sin e-NCF no inventa un número para el correo", () => {
    assert.throws(() => correoFacturaCliente("202609I340", {}, " "), /Falta el e-NCF/);
  });
});