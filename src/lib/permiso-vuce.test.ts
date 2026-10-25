import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
function expect(actual: unknown) {
  return {
    toBe: (value: unknown) => assert.equal(actual, value),
    toBeNull: () => assert.equal(actual, null),
    toEqual: (value: unknown) => assert.deepEqual(actual, value),
    toMatchObject: (value: Record<string, unknown>) => {
      assert.ok(actual && typeof actual === "object");
      for (const [k, v] of Object.entries(value)) assert.deepEqual((actual as Record<string, unknown>)[k], v);
    },
  };
}
import { aplicarDetalleVuce, leerDetalleSolicitudVuce } from "./permiso-vuce";

const pendiente = `Detalle Solicitud - VUCE
No. Trámite: TRM-0926-2533722
Organismo Externo: Ministerio de Agricultura
Estado: Pendiente de Pago
Fecha de Vencimiento: -
Historial de Aprobaciones
Fecha de Aprobación: 25/09/2026
Fecha de Aprobación: 24/10/2026`;
const aprobado = pendiente.replace("Pendiente de Pago", "Aprobado").replace("Vencimiento: -", "Vencimiento: 24/12/2026");
describe("Detalle Solicitud VUCE", () => {
  test("No. Trámite e institución se extraen por etiqueta", () => {
    expect(leerDetalleSolicitudVuce(pendiente)).toMatchObject({ numero: "TRM-0926-2533722", institucion_emisora: "Ministerio de Agricultura" });
  });
  test("Pendiente de Pago no toma fechas de aprobaciones parciales", () => {
    expect(leerDetalleSolicitudVuce(pendiente)).toMatchObject({ estado: "pendiente_pago", estado_vuce: "Pendiente de Pago", fecha_vencimiento: null, fecha_aprobacion: null });
  });
  test("aprobación final cronológica, no primera ni última línea", () => {
    expect(leerDetalleSolicitudVuce(aprobado + "\nFecha de Aprobación: 01/10/2026")).toMatchObject({ estado: "aprobado", fecha_vencimiento: "2026-12-24", fecha_aprobacion: "2026-10-24" });
  });
  test("solo fechas del historial, no aprobación fuera de sección", () => {
    expect(leerDetalleSolicitudVuce("Fecha de Aprobación: 31/12/2026\n" + aprobado)?.fecha_aprobacion).toBe("2026-10-24");
  });
  test("reemplazo actualiza estado y fechas conservando campos manuales", () => {
    const form = { numero: "", institucion_emisora: "", estado: "solicitado", estado_vuce: null as string | null, fecha_vencimiento: "2025-01-01", fecha_aprobacion: "2025-01-01", numero_resolucion: "R-123", fecha_emision: "2026-09-20", tipo: "sanitario" };
    const p = leerDetalleSolicitudVuce(pendiente), a = leerDetalleSolicitudVuce(aprobado);
    if (!p || !a) throw new Error("No se extrajo el trámite");
    const first = aplicarDetalleVuce(form, p);
    expect([first.fecha_vencimiento, first.fecha_aprobacion]).toEqual(["", ""]);
    expect(aplicarDetalleVuce(first, a)).toMatchObject({ estado: "aprobado", fecha_vencimiento: "2026-12-24", fecha_aprobacion: "2026-10-24", numero_resolucion: "R-123", fecha_emision: "2026-09-20", tipo: "sanitario" });
  });
  test("otras variantes mantienen etiqueta y clasificación operativa", () => {
    expect(leerDetalleSolicitudVuce(pendiente.replace("Pendiente de Pago", "En Evaluación"))).toMatchObject({ estado_vuce: "En Evaluación", estado: "en_tramite" });
  });
  test("fecha inexistente no se inventa", () => {
    expect(leerDetalleSolicitudVuce(aprobado.replace("24/12/2026", "31/02/2026"))?.fecha_vencimiento).toBeNull();
  });
  test("otras autorizaciones no completan el formulario", () => {
    expect(leerDetalleSolicitudVuce("AUTORIZACION TRM-0926-2533722 expira 24-12-26")).toBeNull();
  });
});