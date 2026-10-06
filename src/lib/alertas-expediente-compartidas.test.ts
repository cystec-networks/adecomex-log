import { test } from "node:test";
import assert from "node:assert/strict";
import { alertaPinDga, alertasExpedienteCompartidas } from "./alertas-expediente-compartidas";
import { hoyRDISO } from "./dates";

test("PIN: las dos formas usan la misma fecha y horas calendario", () => {
  const ahora = Date.parse("2026-10-06T21:49:00Z");
  const alerta = alertaPinDga({ liq_siga_termino_at: "2026-10-07T13:26:00Z" }, ahora);
  assert.equal(alerta?.corta, "Vence 16h");
  assert.equal(alerta?.larga, "PIN de pago DGA: Vence en 15 horas y 37 minutos");
  assert.equal(alertaPinDga({ liq_siga_termino_at: "2026-10-03T21:49:00Z" }, ahora)?.corta, "Venció 3d");
});
test("PIN pagado o inválido no produce alerta", () => {
  assert.equal(alertaPinDga({ liq_siga_termino_at: "incorrecta" }), null);
  assert.equal(alertaPinDga({ liq_siga_termino_at: "2026-10-03T21:49:00Z", liq_siga_fecha_pago: "2026-10-03" }), null);
});
test("presentación conserva días hábiles y requiere llegada real y régimen", () => {
  const exp = { estado: "manifestado", fecha_compromiso: null, fecha_llegada_real: hoyRDISO(), regimen_aduanero: "Consumo" };
  const plazos = [{ codigo: "1", nombre: "Consumo", dias: 5 }];
  const alerta = alertasExpedienteCompartidas(exp, plazos).find(a => a.id === "presentacion");
  assert.ok(alerta?.corta.endsWith("dh"));
  assert.ok(alerta?.larga.includes("días hábiles"));
  assert.equal(alertasExpedienteCompartidas({ ...exp, fecha_llegada_real: null }, plazos).some(a => a.id === "presentacion"), false);
});
test("cada alerta adicional tiene ambas formas y no se añade deuda de otro expediente", () => {
  const alertas = alertasExpedienteCompartidas({ estado: "entregado", fecha_llegada_real: null, fecha_compromiso: null, fecha_presentacion_real: hoyRDISO() }, [], {
    permisos: [{ estado: "solicitado", fecha_vencimiento: hoyRDISO() }],
    facturas: [{ monto_total: 100, fecha_vencimiento_pago: "2020-01-01", cxc_pagos: [] }],
    tieneRecepcion: true, incidencias: [{ tipo: "Diferencia de peso/cantidad", estado: "abierta", severidad: "critica" }],
  });
  assert.ok(alertas.some(a => a.corta === "Mora: 1" && a.larga === "Factura en mora: 1 sin pago registrado"));
  assert.ok(alertas.some(a => a.corta.startsWith("Recepción crítica") && a.larga.startsWith("Discrepancia de Recepción crítica")));
  assert.ok(alertas.every(a => a.corta && a.larga));
});