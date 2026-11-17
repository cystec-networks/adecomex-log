import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirGuardadoRecibo, esReciboDga, estadoPagoTardio, leerBalanceLiquidacion, reciboDgaDesdeTexto, validarReciboDga, type BalanceLiquidacion } from "./recibo-dga";

// Extractos reales de PDFs guardados en el sistema (mismo lector de texto que usa la app).
const R312 = `28/9/26, 12:09 p.m. DGA
FRANCISCO ENERIO
Recibo No. : 20260925-2152 | Usuario :
LOPEZ MARTINEZ
Fecha : 25/09/2026 | Fecha : 28/09/2026
Hora : 14:32:38 | Hora : 12:08:30
COMPROBANTE DE PAGO
Administracion Virtual Bank Documento No. 130267901
RECIBIDO DE AGROLACTEOS IMANFA SRL $ : 17,804.86
DIECISIETE MIL OCHOCIENTOS CUATRO CON 86/100
CONCEPTO CANTIDAD PRECIO VALOR RD$
Tasa por Servicio Aduanero 17,546.60
Impuestos Arancelarios 0.00
Impuesto a la Transferencia de Bienes Industrializados y Servicios
0.00
(ITBIS)
Declaración del Valor 0.00
Declaración Unica Aduanera (DUA)-D 258.26
Recargo Art.374, párrafo I, Ley 168-21 (declaración tardía) 0.00
TOTAL 17,804.86
FORMAS DE PAGO
N0. Transacción / Código de
TIPO DE PAGO NUMERO / PIN Banco / Empresa de Adquirencia | MONTO
Autorización
Banca | BANCO POPULAR DOMINICANO C POR
202609252CCCDE02 | 69026350 17,804.86
Electrónica | A
TOTAL 17,804.86
Balance $ : 0.00
FACTURAS PAGADAS
10150-CL11-2609-003796
https://siga.aduanas.gob.do 1/2`;

const R366 = `13/11/26, 10:42 a.m. DGA
FRANCISCO ENERIO
Recibo No. : 20261112-2470 | Usuario :
LOPEZ MARTINEZ
Fecha : 13/11/2026 | Fecha : 13/11/2026
Hora : 09:24:03 | Hora : 10:41:29
COMPROBANTE DE PAGO
Administracion Virtual Bank Documento No. 130267901
RECIBIDO DE AGROLACTEOS IMANFA SRL $ : 313,470.94
TRESCIENTOS TRECE MIL CUATROCIENTOS SETENTA CON 94/100
CONCEPTO CANTIDAD PRECIO VALOR RD$
Tasa por Servicio Aduanero 5,370.79
Impuestos Arancelarios 0.00
Impuesto a la Transferencia de Bienes Industrializados y Servicios
307,841.89
(ITBIS)
Declaración del Valor 0.00
Declaración Unica Aduanera (DUA)-D 258.26
Recargo Art.374, párrafo I, Ley 168-21 (declaración tardía) 0.00
TOTAL 313,470.94
FORMAS DE PAGO
TIPO DE | N0. Transacción / Código de
NUMERO / PIN Banco / Empresa de Adquirencia | MONTO
PAGO | Autorización
Banca | BANCO DE RESERVAS DE LA REPUBLICA
20261112633F4902 | 43501577210 313,470.94
Electrónica | DOMINICANA
TOTAL 313,470.94
Balance $ : 0.00
FACTURAS PAGADAS
10030-CL11-2611-001C63
https://siga.aduanas.gob.do 1/2`;

// PDF combinado: factura e-CF del cliente + comprobante DGA + Liquidación + DUA.
const R398 = `ADECOMEX S R L | Factura de Crédito Fiscal Electrónica
RNC: 130481301 | e-NCF: E310000000401
Monto Total: RD$ 15,930.00
11/11/26, 22:23 DGA
FRANCISCO ENERIO
Recibo No. : 20261106-3395 | Usuario :
LOPEZ MARTINEZ
Fecha : 07/11/2026 | Fecha : 11/11/2026
Hora : 11:05:50 | Hora : 22:23:35
COMPROBANTE DE PAGO
Administracion Virtual Bank Documento No. 130267901
RECIBIDO DE AGROLACTEOS IMANFA SRL $ : 18,214.3
DIECIOCHO MIL DOSCIENTOS CATORCE CON 30/100
CONCEPTO CANTIDAD PRECIO VALOR RD$
Tasa por Servicio Aduanero 17,956.04
Impuestos Arancelarios 0.00
Impuesto a la Transferencia de Bienes Industrializados y Servicios
0.00
(ITBIS)
Declaración del Valor 0.00
Declaración Unica Aduanera (DUA)-D 258.26
Recargo Art.374, párrafo I, Ley 168-21 (declaración tardía) 0.00
TOTAL 18,214.30
FORMAS DE PAGO
TIPO DE PAGO NUMERO / PIN Banco / Empresa de Adquirencia N0. Transacción / Código de Autorización MONTO
Banca Electrónica 20261106B3932439 BANCO POPULAR DOMINICANO C POR A 72102943 18,214.30
TOTAL 18,214.30
Balance $ : 0.00
FACTURAS PAGADAS
10150-CL11-2611-000E4A
https://siga.aduanas.gob.do 1/2
Reporte de Liquidación de Impuestos
Declaración : 10150-IC01-2611-001029 (1.00) | Depósito de [DOCAU] CAUCEDO | Importador : AGROLACTEOS IMANFA SRL
Liquidación : 10150-CL11-2611-000E4A | Destino : | Documento : 130267901
DECLARACION UNICA ADUANERA
(DUA)`;

const R390 = `17 de noviembre de 2026 a las 1:34 p. m.
Comprobante de transacción
Su transacción ha sido realizada.
17/11/2026 - 1:34 P.M.
Desde: | Monto: | Pago a:
Ahorros o Corriente | RD$ 13,638.92 | DGA
Cuenta de Ahorro *****4832 | Pago de impuestos | Referencia 20261117DD833BFB
Canal: Internet Banking Popular | Comisión: RD$ 75.00
N° de referencia: 75763386 | Total a Debitar: RD$ 13,713.92
Contribuyente: PROCESADORA DE GRANOS MAGUANA SRL
Banco Popular Dominicano, S.A. - Banco Múltiple`;

const LIQ377 = `Ministerio de Hacienda
Reporte de Liquidación de Impuestos
Declaración : 10150-IC01-2611-0020EA (1.00) | Depósito de [DOCAU] CAUCEDO | Importador : ATIVA MATERIA PRIMAS S R L
Liquidación : 10150-CL11-2611-001C6A | Destino : | Documento : 130594181
Fecha Decl. : 14/11/2026 | Manifiesto : IGMM2026110783 | Agencia : FRANCISCO ENERIO LOPEZ
ITEM ARANCEL DESCRIPCION UNID. ORIGEN CANT. FOB CIF GRAVAMEN SELECTIVO ITBIS TOTAL
1 2835.39.00 | Kilogramos CHINA 26,000.00 1.70 3,279,411.05 0.00 0.00 590,293.83 590,293.83
Totales 3,279,411.05 0.00 0.00 590,293.83 590,293.83
RD$ US$(60.81) | Total Imp. y Regimen a Pagar: $590,293.83 | Total Diferencia por Preferencia: $0.00
Total FOB: $2,691,896.30 $44,265.00 | Recargo Por Declaración Tardía : $0.00 | Total Monto Liberado del CIF: $-0.86
Seguro : $53,837.93 $885.30 | Multa por Infracción : $0.00 | Tasa Servicio Aduanero: $8,943.80
Flete : $517,824.40 $8,515.00 | Sanción por Infracción : $0.00 | Tasa Servicio Aduanero Pagado: $0.00
Otros : $15,851.57 $260.66 | Interés por Mora : $0.00 | Declaración Unica Aduanera: $258.26
Total CIF : $3,279,410.19 $53,925.96 | Total Impuestos a Pagar : $590,293.83 | Declaración Unica Aduanera Pagado: $0.00
Total Impuestos Pagado : $0.00 | Balance a Pagar por Servicio
Balance a Pagar de Impuestos : $590,293.83 | Aduanero : $9,202.06`;

const L312 = `Reporte de Liquidación de Impuestos
Declaración : 10150-IC01-2609-0035D4 (1.00) | Depósito de [DOCAU] CAUCEDO | Importador : AGROLACTEOS IMANFA SRL
Liquidación : 10150-CL11-2609-003796 (1.00) | Destino : | Documento : 130267901
Fecha Decl. : 25/09/2026 | Manifiesto : IGMM2026091392 | Agencia : FRANCISCO ENERIO LOPEZ
ITEM ARANCEL DESCRIPCION UNID. ORIGEN CANT. FOB CIF GRAVAMEN SELECTIVO ITBIS TOTAL
1 0402.21.90 | Kilogramos ALEMANIA 46,450.00 3.84 10,780,056.44 0.00 0.00 0.00 0.00
Totales 10,780,056.44 0.00 0.00 0.00 0.00
Total FOB: $10,627,323.49 $178,149.69 | Recargo Por Declaración Tardía : $0.00 | Total Monto Liberado del CIF: $0.13
Seguro : $4,474.04 $75.00 | Multa por Infracción : $0.00 | Tasa Servicio Aduanero: $17,546.60
Flete : $119,307.80 $2,000.00 | Sanción por Infracción : $0.00 | Tasa Servicio Aduanero Pagado: $0.00
Otros : $28,951.23 $485.32 | Interés por Mora : $0.00 | Declaración Unica Aduanera: $258.26
Total CIF : $10,780,056.57 $180,710.01 | Total Impuestos a Pagar : $0.00 | Declaración Unica Aduanera Pagado: $0.00
Total Impuestos Pagado : $0.00 | Balance a Pagar por Servicio
Balance a Pagar de Impuestos : $0.00 | Aduanero : $17,804.86`;

// R377 es un composing de muestra (el recibo real de 202610I377 no está en el sistema): usa los
// números y montos reales de su Liquidación y su PIN para probar la comparación completa.
const R377 = `Recibo No. : 20261114-5121 | Usuario :
LOPEZ MARTINEZ
Fecha : 14/11/2026 | Fecha : 14/11/2026
Hora : 19:04:11 | Hora : 19:05:02
COMPROBANTE DE PAGO
Administracion Virtual Bank Documento No. 130594181
RECIBIDO DE ATIVA MATERIA PRIMAS S R L $ : 599,495.89
QUINIENTOS NOVENTA Y NUEVE MIL CUATROCIENTOS NOVENTA Y CINCO CON 89/100
CONCEPTO CANTIDAD PRECIO VALOR RD$
Tasa por Servicio Aduanero 8,943.80
Impuestos Arancelarios 0.00
Impuesto a la Transferencia de Bienes Industrializados y Servicios
590,293.83
(ITBIS)
Declaración del Valor 0.00
Declaración Unica Aduanera (DUA)-D 258.26
Recargo Art.374, párrafo I, Ley 168-21 (declaración tardía) 0.00
TOTAL 599,495.89
FORMAS DE PAGO
Banca Electrónica 20261114F901382E BANCO POPULAR DOMINICANO C POR A 72353573 599,495.89
TOTAL 599,495.89
Balance $ : 0.00
FACTURAS PAGADAS
10150-CL11-2611-001C6A
https://siga.aduanas.gob.do 1/2`;

describe("Recibo de pago DGA (reglas fijas)", () => {
  it("lee número, fecha y hora de pago, RNC, concepts y total del comprobante real", () => {
    const r = reciboDgaDesdeTexto(R312);
    assert.ok(r);
    assert.equal(r.recibo, "20260925-2152");
    assert.equal(r.fecha_pago, "2026-09-25");
    assert.equal(r.hora_pago, "14:32:38");
    assert.equal(r.rnc, "130267901");
    assert.equal(r.recibido_de, "AGROLACTEOS IMANFA SRL");
    assert.equal(r.monto, 17804.86);
    assert.equal(r.conceptos.servicio, 17546.6);
    assert.equal(r.conceptos.arancel, 0);
    assert.equal(r.conceptos.itbis, 0);
    assert.equal(r.conceptos.declaracion_valor, 0);
    assert.equal(r.conceptos.dua, 258.26);
    assert.equal(r.conceptos.recargo, 0);
    assert.equal(r.total, 17804.86);
    assert.equal(r.balance, 0);
    assert.deepEqual(r.facturas_pagadas, ["10150-CL11-2609-003796"]);
  });
  it("forma de pago: PIN, transacción, banco y monto aunque las columnas se partan en líneas", () => {
    const r = reciboDgaDesdeTexto(R312)!;
    assert.equal(r.formas.length, 1);
    assert.equal(r.formas[0].numero_pin, "202609252CCCDE02");
    assert.equal(r.formas[0].transaccion, "69026350");
    assert.equal(r.formas[0].banco, "BANCO POPULAR DOMINICANO");
    assert.equal(r.formas[0].monto, 17804.86);
    assert.equal(r.formas[0].tipo, "Banca Electrónica");
    const b = reciboDgaDesdeTexto(R366)!;
    assert.equal(b.formas[0].numero_pin, "20261112633F4902");
    assert.equal(b.formas[0].transaccion, "43501577210");
    assert.equal(b.formas[0].banco, "BANCO DE RESERVAS DE LA REPUBLICA DOMINICANA");
    assert.equal(b.formas[0].monto, 313470.94);
    assert.equal(b.conceptos.itbis, 307841.89);
  });
  it("importe con un solo decimal y fecha de pago distinta de la del número de recibo (PDF combinado)", () => {
    const r = reciboDgaDesdeTexto(R398)!;
    assert.equal(r.recibo, "20261106-3395");
    assert.equal(r.fecha_pago, "2026-11-07");
    assert.equal(r.hora_pago, "11:05:50");
    assert.equal(r.monto, 18214.3);
    assert.equal(r.total, 18214.3);
    assert.equal(r.conceptos.servicio, 17956.04);
    assert.equal(r.formas[0].numero_pin, "20261106B3932439");
    assert.equal(r.formas[0].transaccion, "72102943");
    assert.deepEqual(r.facturas_pagadas, ["10150-CL11-2611-000E4A"]);
  });
  it("el PDF combinado no arrastra números de la Liquidación ni de la DUA al listado de facturas pagadas", () => {
    const r = reciboDgaDesdeTexto(R398)!;
    assert.deepEqual(r.facturas_pagadas, ["10150-CL11-2611-000E4A"]);
    assert.equal(r.conceptos.itbis, 0);
    assert.equal(r.total, 18214.3);
  });
  it("un comprobante del banco no es un recibo DGA", () => {
    assert.equal(esReciboDga(R390), false);
    assert.equal(reciboDgaDesdeTexto(R390), null);
    assert.equal(esReciboDga(R312), true);
  });
  it("lee los saldos de la Liquidación, no el monto bruto", () => {
    const l = leerBalanceLiquidacion(LIQ377)!;
    assert.equal(l.numero, "10150-CL11-2611-001C6A");
    assert.equal(l.itbis, 590293.83);
    assert.equal(l.gravamen, 0);
    assert.equal(l.servicio, 8943.8);
    assert.equal(l.servicio_pagado, 0);
    assert.equal(l.dua, 258.26);
    assert.equal(l.dua_pagado, 0);
    assert.equal(l.recargo, 0);
    assert.equal(l.impuestos, 590293.83);
    assert.equal(l.impuestos_pagado, 0);
    assert.equal(l.balance_impuestos, 590293.83);
    assert.equal(l.balance_servicio, 9202.06);
    assert.equal(l.fecha_declaracion, "2026-11-14");
    assert.equal(l.importador, "ATIVA MATERIA PRIMAS S R L");
  });
  it("valida el recibo contra su Liquidación: todos los conceptos y el total coinciden", () => {
    const v = validarReciboDga(reciboDgaDesdeTexto(R312)!, [leerBalanceLiquidacion(L312)!]);
    assert.equal(v.estado, "ok");
    assert.deepEqual(v.emparejadas, ["10150-CL11-2609-003796"]);
    assert.deepEqual(v.sin_emparejar, []);
    assert.equal(v.total_liquidacion, 17804.86);
    assert.equal(v.filas.find((f) => f.clave === "servicio")?.estado, "ok");
    assert.equal(v.filas.find((f) => f.clave === "itbis")?.estado, "ok");
    assert.equal(v.filas.find((f) => f.clave === "total")?.estado, "ok");
    assert.deepEqual(v.avisos, []);
  });
  it("marca la diferencia cuando un concepto no coincide con la Liquidación", () => {
    const recibo = { ...reciboDgaDesdeTexto(R312)!, conceptos: { ...reciboDgaDesdeTexto(R312)!.conceptos, itbis: 100 } };
    const v = validarReciboDga(recibo, [leerBalanceLiquidacion(L312)!]);
    assert.equal(v.estado, "difiere");
    const fila = v.filas.find((f) => f.clave === "itbis")!;
    assert.equal(fila.estado, "difiere");
    assert.equal(fila.diferencia, 100);
  });
  it("compara el total contra el saldo (balance) y no contra el monto bruto", () => {
    const conPagoPrevio: BalanceLiquidacion = { ...leerBalanceLiquidacion(LIQ377)!, impuestos_pagado: 100000, balance_impuestos: 490293.83 };
    const v = validarReciboDga(reciboDgaDesdeTexto(R377)!, [conPagoPrevio]);
    assert.equal(v.total_liquidacion, 499495.89);
    assert.equal(v.filas.find((f) => f.clave === "total")?.estado, "difiere");
    assert.equal(v.filas.find((f) => f.clave === "itbis")?.estado, "parcial");
    assert.ok(v.avisos.some((a) => a.includes("impuestos pagados anteriores")));
  });
  it("un recibo cuyo número no está en la Liquidación del Expediente no se compara", () => {
    const v = validarReciboDga(reciboDgaDesdeTexto(R377)!, [leerBalanceLiquidacion(L312)!]);
    assert.equal(v.estado, "sin_emparejar");
    assert.deepEqual(v.sin_emparejar, ["10150-CL11-2611-001C6A"]);
    assert.ok(v.avisos.some((a) => a.includes("no coincide con la Liquidación")));
  });
  it("avisa el balance pendiente del recibo y el pago de varias liquidaciones", () => {
    const r = { ...reciboDgaDesdeTexto(R377)!, balance: 5000, facturas_pagadas: ["10150-CL11-2611-001C6A", "10150-CL11-2611-000001"] };
    const v = validarReciboDga(r, [leerBalanceLiquidacion(LIQ377)!]);
    assert.ok(v.avisos.some((a) => a.includes("balance pendiente")));
    assert.ok(v.avisos.some((a) => a.includes("2 liquidaciones")));
  });
  it("completa solo los campos vacíos del Expediente y conserva lo manual con aviso", () => {
    const recibo = reciboDgaDesdeTexto(R377)!;
    const v = validarReciboDga(recibo, [leerBalanceLiquidacion(LIQ377)!]);
    const { cambios, avisos } = decidirGuardadoRecibo({}, recibo, v);
    assert.equal(cambios.liq_siga_fecha_pago, "2026-11-14");
    assert.equal(cambios.liq_recibo_numero, "20261114-5121");
    assert.equal(cambios.liq_recibo_banco, "BANCO POPULAR DOMINICANO");
    assert.equal(cambios.liq_recibo_transaccion, "72353573");
    assert.equal(cambios.liq_siga_pin_pago, "20261114F901382E");
    assert.equal(cambios.liq_oficial_total, 599495.89);
    assert.deepEqual(avisos, []);
    const conTotal = decidirGuardadoRecibo({ liq_oficial_total: 600000 }, recibo, v);
    assert.equal(conTotal.cambios.liq_oficial_total, undefined);
    assert.ok(conTotal.avisos.some((a) => a.includes("Total oficial") && a.includes("Se conserva el dato del Expediente")));
    const previo = decidirGuardadoRecibo({ liq_siga_fecha_pago: "2026-11-13", liq_recibo_numero: "20261114-0000" }, recibo, v);
    assert.equal(previo.cambios.liq_siga_fecha_pago, undefined);
    assert.equal(previo.cambios.liq_recibo_numero, undefined);
    assert.equal(previo.cambios.liq_recibo_banco, "BANCO POPULAR DOMINICANO");
    assert.ok(previo.avisos.some((a) => a.includes("Fecha de pago") && a.includes("Se conserva el dato del Expediente")));
    assert.ok(previo.avisos.some((a) => a.includes("N.º de recibo")));
  });
  it("clasifica el pago según el vencimiento del PIN, sin inventar fechas", () => {
    const recibo = reciboDgaDesdeTexto(R377)!;
    assert.equal(estadoPagoTardio(recibo, "2026-11-18T18:57:17-04:00"), "a_tiempo");
    assert.equal(estadoPagoTardio(recibo, "2026-11-14T18:00:00-04:00"), "tardio");
    assert.equal(estadoPagoTardio(recibo, null), "sin_dato");
    assert.equal(estadoPagoTardio({ ...recibo, fecha_pago: null }, "2026-11-18T18:57:17-04:00"), "sin_dato");
  });
});
