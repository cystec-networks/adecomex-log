import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirNumeroDua, emparejarDua, esAutomaticoDua, esNumeroDua, leerDuaDocumento, leerNumeroDeclaracion, numeroDuaDesdeArchivo, resolverNumeroDua } from "./declaracion-dua";
import { leerLiquidacionDga, decidirLiquidacionDga } from "./liquidacion-dga-documento";

// Extractos reales: 202611I413 (LCL, «:» en su propia línea) y 202610I372 (FCL).
const LCL = `Reporte de Liquidación de Impuestos\nUsuario : MARICRUZ DE LOS\nSANTOS\nDeclaración\n:\n10030-IC01-2611-002613 (1.00)\nLiquidación\n:\n10030-CL11-2611-0025EA (1.00)\nFecha Decl.\n:\n16/11/2026\nRegimen : DESPACHO A CONSUMO\nResuInsp : 10030-IC10-2611-001D5F (1.00)\nEstado : Registrado/Aceptado\nDepósito de\nDestino :\n[EMWH1103] TERMINALES HAINA\nS.A (MARITIMA DOMINICANA)\nManifiesto : IGMM2026110661\nConsignatario : AGRODETALLES SRL\nFecha Llegada : 12/11/2026\nNúmero B/L : INCO78091126\nEndosado :\nAdm : ADMINISTRACION HAINA\nORIENTAL\nImportador : AGRODETALLES SRL\nAgencia :\nResolución :\nOBSERVACIONES\nDeclaración Web\nLCL STC: 1 PALETA CON 10 BULTOS DE MACE 75 WP 1 KG, EMB.: UPL COSTA RICA, S.A., FACTURA 00100001090000102500, EXP.: 202611I413.\nITEM ARANCEL DESCRIPCION`;
const FCL = `Reporte de Liquidación de Impuestos\nDeclaración : 10150-IC01-2611-00113E (1.00)\nLiquidación : 10150-CL11-2611-001E1A\n(1.00)\nFecha Decl. : 16/11/2026\nResuInsp : 10150-IC10-2611-001730 (1.00)\nEstado : Registrado/Aceptado\nDepósito de Destino\n:\n[DOCAU] CAUCEDO\nManifiesto : IGMM2026110884\nFecha Llegada : 15/11/2026\nNúmero B/L : KLP0168698\nImportador : AGROLACTEOS IMANFA SRL\nOBSERVACIONES\nDeclaración Web\nFCL 3X40 STC: 2,880 FUNDAS, EXP.: 202610I372.\nITEM ARANCEL`;
const DUA_TEMP = `DECLARACION UNICA ADUANERA\n(DUA)\nIDENTIFICACIÓN\nA) DECLARACIÓN : B) IMPORTADOR/EXPORTADOR C) AGENTE DE ADUANAS\n1. NO. DE DECLARACIÓN 10030-IC01-2611-002613\n2. FECHA 16/11/2026\n7. Doc. de Embarque INCO78091126\n1. NOMBRE O RAZON SOCIAL\nAGRODETALLES SRL\nOBSERVACIONES\nLCL STC: 1 PALETA, EXP.: 202611I413.`;

describe("Número de Declaración (DUA)", () => {
  it("patrón: el último grupo hexadecimal puede terminar en dígito o letra", () => {
    assert.ok(esNumeroDua("10030-IC01-2611-002613"));
    assert.ok(esNumeroDua("10150-IC01-2611-00113E"));
    assert.ok(!esNumeroDua("10150-IC01-2611-00113G"));
    assert.ok(!esNumeroDua("1015-IC01-2611-00113E"));
  });
  it("LCL: toma el de Declaración aunque el «:» esté en su propia línea, nunca CL11 ni IC10", () => {
    assert.equal(leerNumeroDeclaracion(LCL).numero, "10030-IC01-2611-002613");
    assert.equal(leerLiquidacionDga(LCL)?.declaracion, "10030-IC01-2611-002613");
  });
  it("FCL: toma el de Declaración en la misma línea", () => {
    assert.equal(leerLiquidacionDga(FCL)?.declaracion, "10150-IC01-2611-00113E");
  });
  it("«:» en la línea siguiente al número también vale", () => {
    assert.equal(leerNumeroDeclaracion("Liquidación : 10030-CL11-2611-0025EA\n10030-IC01-2611-002613 (1.00)\nDeclaración\n:").numero, "10030-IC01-2611-002613");
  });
  it("sin número junto a Declaración no elige el de Liquidación ni ResuInsp", () => {
    const r = leerNumeroDeclaracion("Liquidación : 10030-CL11-2611-0025EA\nResuInsp : 10030-IC10-2611-001D5F");
    assert.equal(r.numero, null); assert.ok(r.motivo);
  });
  it("DUA TEMP: número, fecha, BL hijo, EXP e importador", () => {
    assert.deepEqual(leerDuaDocumento(DUA_TEMP), { declaracion: "10030-IC01-2611-002613", motivo: null, fecha_declaracion: "2026-11-16", bl: "INCO78091126", exp: "202611I413", importador: "AGRODETALLES SRL" });
  });
  it("nombre del archivo DOC-<número> como respaldo; si difiere del texto gana el texto con alerta", () => {
    assert.equal(numeroDuaDesdeArchivo("8fa/1794866365490_DOC-10030-IC01-2611-002613 LIQ 413.pdf"), "10030-IC01-2611-002613");
    assert.equal(numeroDuaDesdeArchivo("DOC -10150-IC01-2611-00113E DUA 372 IMANFA.pdf"), "10150-IC01-2611-00113E");
    assert.deepEqual(resolverNumeroDua({ numero: null, motivo: "x" }, "DOC-10030-IC01-2611-002613_LIQ.pdf"), { numero: "10030-IC01-2611-002613", fuente: "archivo", alerta: null, motivo: null });
    const r = resolverNumeroDua({ numero: "10030-IC01-2611-002613", motivo: null }, "DOC-10030-IC01-2611-002614_LIQ.pdf");
    assert.equal(r.numero, "10030-IC01-2611-002613"); assert.equal(r.fuente, "texto"); assert.ok(r.alerta);
    assert.equal(resolverNumeroDua({ numero: null, motivo: "sin texto" }, "DUA TEMP 413.pdf").numero, null);
  });
  it("empareja por EXP o BL hijo; cliente distinto solo avisa", () => {
    const e = emparejarDua({ numero: "202611I413", bl_awb: "INCO78091126", clientes_nombres: ["OTRO CLIENTE SRL"] }, { exp: "202611I413", bl: "INCO78091126", importador: "AGRODETALLES SRL" });
    assert.equal(e.aplicar, true); assert.equal(e.cliente, "no_coincide"); assert.equal(e.alertas.length, 1);
    const unoSolo = emparejarDua({ numero: "202611I413", bl_awb: "OTROBL" }, { exp: "202611I413", bl: "INCO78091126" });
    assert.equal(unoSolo.aplicar, true); assert.equal(unoSolo.alertas.length, 1);
  });
  it("EXP y BL de otro Expediente: no llena nada", () => {
    const e = emparejarDua({ numero: "202611I414", bl_awb: "MSCU1" }, { exp: "202611I413", bl: "INCO78091126" });
    assert.equal(e.aplicar, false);
    assert.equal(decidirNumeroDua("", { numero: "10030-IC01-2611-002613", fuente: "texto", alerta: null, motivo: null }, e).estado, "rechazado");
  });
  it("solo llena si está vacía; nunca sobrescribe lo manual", () => {
    const ok = emparejarDua({ numero: "202611I413", bl_awb: "INCO78091126" }, { exp: "202611I413", bl: "INCO78091126" });
    const n = { numero: "10030-IC01-2611-002613", fuente: "texto" as const, alerta: null, motivo: null };
    assert.equal(decidirNumeroDua(null, n, ok).numero_dua, "10030-IC01-2611-002613");
    const manual = decidirNumeroDua("MANUAL-1", n, ok);
    assert.equal(manual.numero_dua, undefined); assert.equal(manual.estado, "conservado"); assert.ok(manual.alertas.length);
    assert.equal(decidirNumeroDua("10030-IC01-2611-002613", n, ok).estado, "coincide");
  });
  it("etiqueta Automático solo mientras el valor siga siendo el del documento", () => {
    const exp = { numero_dua: "10030-IC01-2611-002613", dga_auto: { numero_dua: { valor: "10030-IC01-2611-002613" } } };
    assert.ok(esAutomaticoDua(exp));
    assert.ok(!esAutomaticoDua(exp, "OTRO"));
  });
  it("opcional: manifiesto, fecha y estado de la Liquidación LCL; Depósito LCL no es puerto", () => {
    const d = leerLiquidacionDga(LCL)!;
    assert.equal(d.manifiesto, "IGMM2026110661"); assert.equal(d.fecha_declaracion, "2026-11-16"); assert.equal(d.estado, "Registrado/Aceptado");
    assert.equal(d.puerto, null); assert.equal(d.exp, "202611I413");
    const { avisos } = decidirLiquidacionDga({ fecha_llegada_real: "2026-11-13" }, d);
    assert.ok(avisos.some((a) => a.startsWith("Llegada")));
  });
});
