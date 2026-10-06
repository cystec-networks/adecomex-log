import { describe, expect, test } from "bun:test";
import { alertasAdicionalesExpediente } from "./alertas-expediente";
import { hoyRD, hoyRDISO } from "./dates";

function fecha(dias: number) {
  const d = hoyRD();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const expediente = { estado: "entregado", fecha_llegada_real: fecha(-20), fecha_compromiso: null };
describe("Alertas independientes del expediente", () => {
  test("sin condiciones no deja alertas", () => {
    expect(alertasAdicionalesExpediente({ expediente })).toEqual([]);
  });
  test("VUCE: hoy y 15 días incluidos, vencidos/aprobados/16 excluidos", () => {
    const permisos = [
      { estado: "solicitado", fecha_vencimiento: hoyRDISO() },
      { estado: "en_tramite", fecha_vencimiento: fecha(15) },
      { estado: "solicitado", fecha_vencimiento: fecha(16) },
      { estado: "solicitado", fecha_vencimiento: fecha(-1) },
      { estado: "aprobado", fecha_vencimiento: fecha(2) },
    ];
    expect(alertasAdicionalesExpediente({ expediente, permisos })[0]).toContain(": 2 ");
  });
  test("mora: solo vencida sin pago, no pagada/parcial/hoy/sin fecha", () => {
    const f = { fecha_vencimiento_pago: fecha(-1), monto_total: 100, cxc_pagos: [] };
    const facturas = [f, { ...f, cxc_pagos: [{ monto: 100 }] }, { ...f, cxc_pagos: [{ monto: 20 }] }, { ...f, fecha_vencimiento_pago: hoyRDISO() }, { ...f, fecha_vencimiento_pago: null }];
    expect(alertasAdicionalesExpediente({ expediente, facturas })).toEqual(["Factura en mora: 1 sin pago registrado"]);
  });
  test("recepción formal y discrepancia activa; críticas y resueltas", () => {
    const incidencias = [{ tipo: "Diferencia de peso/cantidad", estado: "abierta", severidad: "critica" }, { tipo: "Diferencia de peso/cantidad", estado: "resuelta", severidad: "alta" }];
    expect(alertasAdicionalesExpediente({ expediente, incidencias })).toEqual([]);
    expect(alertasAdicionalesExpediente({ expediente, incidencias, tieneRecepcion: true })[0]).toContain("crítica: 1");
  });
  test("flujo atrasado, llegada real prioritaria y estados avanzados", () => {
    expect(alertasAdicionalesExpediente({ expediente: { ...expediente, estado: "digitar", fecha_llegada_real: null, fecha_compromiso: fecha(3) } })[0]).toContain("Etapa estancada");
    expect(alertasAdicionalesExpediente({ expediente: { ...expediente, estado: "en_transito", fecha_compromiso: fecha(10) } })[0]).toContain("Etapa estancada");
    expect(alertasAdicionalesExpediente({ expediente: { ...expediente, estado: "manifestado" } })[0]).toContain("Etapa estancada");
    expect(alertasAdicionalesExpediente({ expediente: { ...expediente, estado: "presentar" } })).toEqual([]);
    expect(alertasAdicionalesExpediente({ expediente: { estado: "digitar", fecha_llegada_real: null, fecha_compromiso: null } })).toEqual([]);
  });
  test("las cuatro condiciones coexisten", () => {
    const resultado = alertasAdicionalesExpediente({ expediente: { ...expediente, estado: "digitar" }, permisos: [{ estado: "solicitado", fecha_vencimiento: fecha(1) }], facturas: [{ fecha_vencimiento_pago: fecha(-1), monto_total: 100, cxc_pagos: [] }], tieneRecepcion: true, incidencias: [{ tipo: "Diferencia de peso/cantidad", estado: "en_gestion", severidad: "alta" }] });
    expect(resultado).toHaveLength(4);
  });
});