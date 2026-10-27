import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerLiquidacionDga, decidirLiquidacionDga } from "./liquidacion-dga-documento";
const temporal = `Reporte de Liquidación de Impuestos\nDeclaración : 10150-IC01-2610-004156 (1.00)\nLiquidación : Temporal ()\nFecha Decl. : 26/10/2026\nManifiesto :\nResuInsp : ()\nNúmero B/L :\nFecha Llegada : //\nDepósito de Destino : [DOCAU] CAUCEDO\nPeso Neto KG: 50,000.00\nTotal Impuestos a Pagar : $2,295,650.79\nTasa Servicio Aduanero: $0.00\nTasa Servicio Aduanero Pagado: $999.00\nDeclaración Unica Aduanera: $258.26`;
describe("Liquidación DGA documental", () => {
  it("Temporal completa solo DUA fecha puerto y peso, nunca identificadores vacíos", () => {
    const datos = leerLiquidacionDga(temporal); assert.ok(datos);
    assert.equal(datos.numero, null);
    assert.deepEqual(decidirLiquidacionDga({}, datos).cambios, { numero_dua: "10150-IC01-2610-004156", fecha_presentacion_real: "2026-10-26", puerto_arribo: "CAUCEDO", puerto_arribo_codigo: "DOCAU", peso_neto: 50000 });
  });
  it("definitiva extrae número BL llegada manifiesto e inspección", () => {
    const datos = leerLiquidacionDga(temporal.replace("Temporal ()", "10150-CL11-2610-0031A5").replace("Manifiesto :", "Manifiesto : MAN-123").replace("ResuInsp : ()", "ResuInsp : RI-456").replace("Número B/L :", "Número B/L : MEDUDB736269").replace("Fecha Llegada : //", "Fecha Llegada : 23/10/2026")); assert.ok(datos);
    assert.equal(datos.numero, "10150-CL11-2610-0031A5");
    const { cambios } = decidirLiquidacionDga({}, datos);
    assert.equal(cambios.bl_awb, "MEDUDB736269"); assert.equal(cambios.fecha_llegada_real, "2026-10-23"); assert.equal(cambios.liq_dga_manifiesto, "MAN-123"); assert.equal(cambios.liq_dga_resultado_inspeccion, "RI-456");
  });
  it("BL y Llegada diferentes solo avisan, ausentes nunca borran", () => {
    const { cambios, avisos } = decidirLiquidacionDga({ bl_awb: "ORIGINAL", fecha_llegada_real: "2026-10-22", liq_dga_manifiesto: "MAN" }, { bl: "OTRO", llegada: "2026-10-23" });
    assert.deepEqual(cambios, {}); assert.equal(avisos.length, 2);
  });
  it("compara suma íntegra sin usar tasas pagadas ni cambiar total oficial", () => {
    const datos = leerLiquidacionDga(temporal); assert.ok(datos);
    assert.deepEqual(decidirLiquidacionDga({ liq_oficial_total: 2295909.05 }, datos).avisos, []);
    assert.ok(decidirLiquidacionDga({ liq_oficial_total: 1 }, datos).avisos.includes("Verifica: el total de la Liquidación no coincide con el PIN de pago registrado"));
  });
  it("Observaciones distintas solo advierten, no modifican Descripción", () => {
    const r = decidirLiquidacionDga({ descripcion_mercancia: "MANUAL", observaciones_estructura: { descripcion: "LECHE" } }, { observaciones: "OTRO" });
    assert.deepEqual(r.cambios, {}); assert.equal(r.avisos.length, 1);
  });
  it("no fabrica fecha ni total cuando faltan", () => {
    const r = decidirLiquidacionDga({ liq_oficial_total: 5800 }, { fecha_declaracion: "30/02/2026", impuestos: 5800 }); assert.deepEqual(r, { cambios: {}, avisos: [] });
  });
});