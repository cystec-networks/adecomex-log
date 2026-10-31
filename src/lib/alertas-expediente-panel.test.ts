import { test } from "node:test";
import assert from "node:assert/strict";
import { recordatoriosAlertasExpedientes, type ExpedientePanel } from "./alertas-expediente-panel";
import { hoyRDISO } from "./dates";

const exp: ExpedientePanel = { id: "exp-1", numero: "202610I001", updated_at: "2026-10-30", estado: "digitar", fecha_compromiso: null, fecha_llegada_real: null, clientes: { nombre: "Cliente" } };
test("documentos pendientes: una fila por expediente, desaparece al cargar los dos documentos requeridos", () => {
  assert.equal(recordatoriosAlertasExpedientes([exp], [], { [exp.id]: { documentos: [] } }).filter(r => r.kind === "expediente_documentos").length, 1);
  const documentos = ["Factura comercial", "Bill of Lading"].map(tipo => ({ tipo, estado: "recibido", storage_path: `docs/${tipo}.pdf`, fecha_recepcion: null, created_at: "2026-10-30" }));
  assert.equal(recordatoriosAlertasExpedientes([exp], [], { [exp.id]: { documentos } }).filter(r => r.kind === "expediente_documentos").length, 0);
});
test("permisos sin aprobar aparecen y aprobados no; avisos del mismo expediente no duplican filas", () => {
  const pendientes = recordatoriosAlertasExpedientes([exp], [], { [exp.id]: { permisos: [{ estado: "solicitado", fecha_vencimiento: hoyRDISO() }] } });
  assert.equal(pendientes.filter(r => r.kind === "expediente_permisos").length, 1);
  assert.equal(recordatoriosAlertasExpedientes([exp], [], { [exp.id]: { permisos: [{ estado: "aprobado", fecha_vencimiento: hoyRDISO() }] } }).length, 0);
});
test("etapa estancada respeta el cálculo del listado y no el updated_at", () => {
  const datos = { [exp.id]: {} };
  assert.equal(recordatoriosAlertasExpedientes([{ ...exp, fecha_compromiso: hoyRDISO() }], [], datos).filter(r => r.kind === "expediente_etapa").length, 1);
  assert.equal(recordatoriosAlertasExpedientes([{ ...exp, estado: "en_transito", fecha_compromiso: hoyRDISO() }], [], datos).filter(r => r.kind === "expediente_etapa").length, 0);
});
test("sin evidencias no se inventan alertas; mora y recepción conservan sus categorías", () => {
  assert.equal(recordatoriosAlertasExpedientes([exp], [], {}).length, 0);
  const rows = recordatoriosAlertasExpedientes([exp], [], { [exp.id]: { facturas: [{ monto_total: 100, fecha_vencimiento_pago: "2020-01-01", cxc_pagos: [] }], tieneRecepcion: true, incidencias: [{ tipo: "Diferencia de peso/cantidad", estado: "abierta", severidad: "critica" }] } });
  assert.deepEqual(rows.map(r => r.kind), ["expediente_mora", "expediente_recepcion"]);
});