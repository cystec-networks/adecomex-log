import { expect, test } from "bun:test";
import {
  tipoConceptoSugerido, validarAsignaciones, completarReparto, alertaMonto, montoEsperadoTransporte,
  ordenarCandidatos, preseleccionEscaneo, prioridadCandidatos, parteAsignada, unirFilas, type Candidato,
} from "./factura-ecf-asignacion";

const R = (importe: number, tipo: any) => ({ importe, tipo });

test("tipo sugerido por descripción", () => {
  expect(tipoConceptoSugerido("Servicios de gestión aduanal")).toBe("gestion_aduanal");
  expect(tipoConceptoSugerido("Servicios de Transportes (exentos)")).toBe("transporte");
  expect(tipoConceptoSugerido("Reembolso de flete")).toBe("reembolso");
  expect(tipoConceptoSugerido("Almacenaje")).toBe("otros");
});

test("los montos asignados deben sumar exactamente el total", () => {
  const r = [R(1000, "gestion_aduanal"), R(500, "transporte")];
  const ok = validarAsignaciones(r, [{ linea: 0, destino: "exp:a", monto: 1000 }, { linea: 1, destino: "tr:t", monto: 500 }], 1500);
  expect(ok.valida).toBe(true);
  const falta = validarAsignaciones(r, [{ linea: 0, destino: "exp:a", monto: 1000 }, { linea: 1, destino: "tr:t", monto: 499.99 }], 1500);
  expect(falta.valida).toBe(false);
  expect(falta.diferencia).toBe(0.01);
});

test("un renglón de transporte puede repartirse entre varios TR con su monto", () => {
  const r = [R(900, "transporte")];
  const v = validarAsignaciones(r, [{ linea: 0, destino: "tr:a", monto: 600 }, { linea: 0, destino: "tr:b", monto: 300 }], 900);
  expect(v.valida).toBe(true);
});

test("gestión aduanal nunca va a un Transporte", () => {
  const v = validarAsignaciones([R(1000, "gestion_aduanal")], [{ linea: 0, destino: "tr:t", monto: 1000 }], 1000);
  expect(v.valida).toBe(false);
  expect(v.errores[0]).toContain("solo a Transportes");
});

test("reembolso tampoco va a un Transporte", () => {
  const v = validarAsignaciones([R(200, "reembolso")], [{ linea: 0, destino: "tr:t", monto: 200 }], 200);
  expect(v.valida).toBe(false);
});

test("transporte puede ir al Expediente cuando la factura es del Expediente", () => {
  const v = validarAsignaciones([R(1000, "gestion_aduanal"), R(400, "transporte")], [{ linea: 0, destino: "exp:a", monto: 1000 }, { linea: 1, destino: "exp:a", monto: 400 }], 1400);
  expect(v.valida).toBe(true);
});

test("sin ninguna asignación la factura queda sin vincular y es válida", () => {
  const v = validarAsignaciones([R(100, "otros")], [{ linea: 0, destino: "", monto: 100 }], 100);
  expect(v.vacia).toBe(true);
  expect(v.valida).toBe(true);
});

test("reparto automático: gestión al Expediente, transporte al único TR, sin pisar lo elegido", () => {
  const r = [R(1000, "gestion_aduanal"), R(500, "transporte"), R(50, "reembolso")];
  const filas = completarReparto(r, [{ linea: 2, destino: "exp:otro", monto: 50 }], ["exp:a", "tr:t"]);
  expect(filas.find((f) => f.linea === 0)?.destino).toBe("exp:a");
  expect(filas.find((f) => f.linea === 1)?.destino).toBe("tr:t");
  expect(filas.find((f) => f.linea === 2)?.destino).toBe("exp:otro");
});

test("reparto automático no adivina con dos TR", () => {
  const filas = completarReparto([R(500, "transporte")], [], ["tr:a", "tr:b"]);
  expect(filas[0].destino).toBe("");
});

test("filas repetidas del mismo renglón y destino se unen", () => {
  expect(unirFilas([{ linea: 0, destino: "tr:a", monto: 100 }, { linea: 0, destino: "tr:a", monto: 50 }, { linea: 0, destino: "", monto: 1 }])).toEqual([{ linea: 0, destino: "tr:a", monto: 150 }]);
});

test("alerta de monto solo con diferencia mayor al 20 %", () => {
  expect(alertaMonto(1200, 1000)).toBe(null);
  expect(alertaMonto(1201, 1000) !== null).toBe(true);
  expect(alertaMonto(799, 1000) !== null).toBe(true);
  expect(alertaMonto(800, 1000)).toBe(null);
  expect(alertaMonto(5000, null)).toBe(null);
});

test("monto esperado del Transporte = viajes × precio", () => {
  expect(montoEsperadoTransporte({ cantidad_viajes: 2, precio_viaje: 12500 })).toBe(25000);
  expect(montoEsperadoTransporte({ cantidad_viajes: null, precio_viaje: 12500 })).toBe(null);
});

test("prioridad de candidatos según tipos de renglón", () => {
  expect(prioridadCandidatos(["transporte", "transporte"])).toBe("transporte");
  expect(prioridadCandidatos(["transporte", "gestion_aduanal"])).toBe("expediente");
});

const C = (p: Partial<Candidato>): Candidato => ({ clave: "exp:x", tipo: "expediente", numero: "X", clienteCoincide: true, facturasOtras: [], ...p });

test("Completados nunca son candidatos", () => {
  const o = ordenarCandidatos([C({ clave: "exp:c", completado: true }), C({ clave: "exp:a" })], { expedientes: [], bl: [], contenedores: [], transportes: [] }, null, "expediente");
  expect(o.map((c) => c.clave)).toEqual(["exp:a"]);
});

test("orden: referencia exacta, luego sin factura y fecha cercana", () => {
  const pistas = { expedientes: ["202611I413"], bl: [], contenedores: [], transportes: [] };
  const o = ordenarCandidatos([
    C({ clave: "exp:conFactura", numero: "202611I400", facturasOtras: ["E31"], fecha: "2026-11-10" }),
    C({ clave: "exp:libre", numero: "202611I401", fecha: "2026-11-10" }),
    C({ clave: "exp:ref", numero: "202611I413", facturasOtras: ["E31"], fecha: "2025-01-01" }),
  ], pistas, "2026-11-15", "expediente");
  expect(o.map((c) => c.clave)).toEqual(["exp:ref", "exp:libre", "exp:conFactura"]);
});

test("solo transporte: Transportes antes que Expedientes", () => {
  const o = ordenarCandidatos([C({ clave: "exp:a" }), C({ clave: "tr:t", tipo: "transporte", numero: "TR-000010" })], { expedientes: [], bl: [], contenedores: [], transportes: [] }, null, "transporte");
  expect(o[0].clave).toBe("tr:t");
});

test("preselección por escaneo: número exacto de TR y contenedor único", () => {
  const pistas = { expedientes: [], bl: [], contenedores: ["MSCU1234567"], transportes: ["TR-000036"] };
  const o = ordenarCandidatos([
    C({ clave: "tr:a", tipo: "transporte", numero: "TR-000036" }),
    C({ clave: "tr:b", tipo: "transporte", numero: "TR-000037", contenedores: "MSCU 123456-7" }),
    C({ clave: "exp:e", numero: "202611I413", contenedores: "MSCU1234567" }),
  ], pistas, null, "transporte");
  expect(preseleccionEscaneo(o).sort()).toEqual(["exp:e", "tr:a"]);
});

test("preselección no elige cuando el contenedor coincide con dos Expedientes", () => {
  const pistas = { expedientes: [], bl: [], contenedores: ["MSCU1234567"], transportes: [] };
  const o = ordenarCandidatos([C({ clave: "exp:a", contenedores: "MSCU1234567" }), C({ clave: "exp:b", contenedores: "MSCU1234567" })], pistas, null, "expediente");
  expect(preseleccionEscaneo(o)).toEqual([]);
});

test("parte asignada usa montos asignados; sin reparto cuenta completa", () => {
  const f = {
    monto_total: 1180, vinculo_por_linea: true,
    facturas_ecf_lineas: [{ id: "l1", valor: 1000, itbis: 180 }],
    facturas_ecf_asignaciones: [{ linea_id: "l1", transporte_id: "a", monto: 590 }, { linea_id: "l1", transporte_id: "b", monto: 590 }],
  };
  expect(parteAsignada(f, { transporteId: "a" })).toBe(590);
  expect(parteAsignada(f, { transporteId: "a" }, false)).toBe(500);
  expect(parteAsignada({ monto_total: 1000 }, { transporteId: "a" })).toBe(null);
});

import { estadoInicialVinculacion } from "./factura-ecf-asignacion";

test("estado inicial usa los montos asignados guardados", () => {
  const e = estadoInicialVinculacion(
    [{ id: "l1", importe: 900, tipo: "transporte" }],
    [{ linea_id: "l1", transporte_id: "a", monto: 600 }, { linea_id: "l1", transporte_id: "b", monto: 300 }],
    { expedientes: [], transportes: [] },
  );
  expect(e.destinos).toEqual(["tr:a", "tr:b"]);
  expect(e.filas.map((f) => f.monto)).toEqual([600, 300]);
});

test("factura antigua de un solo Transporte con gestión aduanal se propone y queda marcada como error", () => {
  const lineas = [{ id: "l1", importe: 1000, tipo: "gestion_aduanal" as const }];
  const e = estadoInicialVinculacion(lineas, [], { expedientes: [], transportes: ["t"] });
  expect(e.filas[0].destino).toBe("tr:t");
  expect(validarAsignaciones(lineas, e.filas, 1000).valida).toBe(false);
});

test("factura antigua de un Expediente: todos los renglones al Expediente", () => {
  const e = estadoInicialVinculacion(
    [{ id: "l1", importe: 1000, tipo: "gestion_aduanal" }, { id: "l2", importe: 400, tipo: "transporte" }],
    [], { expedientes: ["e"], transportes: [] },
  );
  expect(e.filas.map((f) => f.destino)).toEqual(["exp:e", "exp:e"]);
});
