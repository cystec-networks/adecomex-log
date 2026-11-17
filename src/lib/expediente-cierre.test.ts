import { describe, expect, it } from "vitest";
import {
  camposBloqueadosCambiados, payloadGuardadoCompletado, evaluarCierre, facturaExigeCobro, lineaTiempoCierre,
  puedeCompletar, puedeReabrir, type HechosCierre,
} from "./expediente-cierre";

const base = (over: Partial<HechosCierre> = {}): HechosCierre => ({
  docs: { factura: true, bl: true, dua: true, liquidacion: true },
  numero_igra: "IGRA20261115233",
  fecha_aprobacion_despacho: "2026-11-14",
  factura_ecf_id: "ecf-1",
  siga_cargado: true,
  siga_despacho_completo: true,
  facturas: [],
  hitos_pendientes: [],
  transportes: [],
  incidencias_abiertas: 0,
  fechas: {},
  ...over,
});

describe("Requisitos de cierre", () => {
  it("exige los cuatro documentos: Factura comercial, BL, DUA y Liquidación", () => {
    const ev = evaluarCierre(base({ docs: { factura: true, bl: true, dua: false, liquidacion: false } }));
    expect(ev.listo).toBe(false);
    expect(ev.pendientes).toContain("Documentos faltantes: DUA, Liquidación de Impuestos");
  });

  it("acepta el despacho completo con N.º de despacho y fecha de aprobación aunque no haya SIGA (solo aviso)", () => {
    const ev = evaluarCierre(base({ siga_cargado: false, siga_despacho_completo: false }));
    expect(ev.listo).toBe(true);
    expect(ev.avisos.some((a) => a.includes("No hay Seguimiento SIGA"))).toBe(true);
  });

  it("sin fecha de aprobación del despacho no está listo", () => {
    expect(evaluarCierre(base({ fecha_aprobacion_despacho: null })).listo).toBe(false);
  });

  it("factura del 31/10/2026 sin cobrar no bloquea; la del 01/11/2026 sí", () => {
    expect(facturaExigeCobro({ emision: "2026-10-31" })).toBe(false);
    expect(facturaExigeCobro({ emision: "2026-11-01" })).toBe(true);
    expect(evaluarCierre(base({ facturas: [{ id: "a", emision: "2026-10-31", monto: 1000, pagado: 0 }] })).listo).toBe(true);
    const ev = evaluarCierre(base({ facturas: [{ id: "b", encf: "E310000000400", emision: "2026-11-01", monto: 1000, pagado: 0 }] }));
    expect(ev.pendientes).toEqual(["Saldo sin cobrar en factura E310000000400"]);
  });

  it("factura de noviembre cobrada completa cumple", () => {
    expect(evaluarCierre(base({ facturas: [{ id: "b", emision: "2026-11-05", monto: 1000, pagado: 1000 }] })).listo).toBe(true);
  });

  it("Checklist pendiente bloquea, salvo en el lote histórico (pasa a «No aplica»)", () => {
    const h = base({ hitos_pendientes: [{ id: "h1", codigo: "expediente_enviado_gestor", nombre: "Expediente enviado al gestor" }] });
    expect(evaluarCierre(h).listo).toBe(false);
    expect(evaluarCierre(h, { omitirChecklist: true }).listo).toBe(true);
  });

  it("viaje sin entregar o sin pago bloquea; pago sin conciliar solo avisa", () => {
    const ev = evaluarCierre(base({ transportes: [{ id: "t", numero: "TR-000036", estado: "en_transito", solicitud_pago_id: null }] }));
    expect(ev.pendientes).toEqual(["Viaje TR-000036 sin entregar", "Viaje TR-000036 sin pago de transporte registrado"]);
    const ok = evaluarCierre(base({ transportes: [{ id: "t", numero: "TR-000036", estado: "entregado", solicitud_pago_id: "s", conciliado: false }] }));
    expect(ok.listo).toBe(true);
    expect(ok.avisos.some((a) => a.includes("sin conciliar"))).toBe(true);
  });

  it("una incidencia abierta bloquea", () => {
    expect(evaluarCierre(base({ incidencias_abiertas: 1 })).pendientes).toEqual(["1 incidencia(s) abierta(s)"]);
  });
});

describe("Permisos de Completado", () => {
  it("Administrador, Operaciones y Finanzas completan; otros no", () => {
    expect(puedeCompletar(["operaciones"])).toBe(true);
    expect(puedeCompletar(["finanzas"])).toBe(true);
    expect(puedeCompletar(["admin"])).toBe(true);
    expect(puedeCompletar(["ejecutivo", "documentacion"])).toBe(false);
  });
  it("solo el Administrador reabre", () => {
    expect(puedeReabrir(["admin"])).toBe(true);
    expect(puedeReabrir(["operaciones", "finanzas"])).toBe(false);
  });
});

describe("Línea de tiempo", () => {
  it("calcula días y deja «sin dato» cuando falta una fecha", () => {
    const l = lineaTiempoCierre({ llegada: "2026-11-11", despacho_siga: "2026-11-14", entregado: "2026-11-16" });
    expect(l.dias).toEqual({ llegada_despacho: 3, despacho_entrega: 2, almacenaje: 5 });
    expect(lineaTiempoCierre({ entregado: "2026-11-16" }).dias.llegada_despacho).toBeNull();
  });
});

describe("Bloqueo en Completado", () => {
  it("bloquea cambiar la DUA guardada, permite llenar un campo vacío y cambiar observaciones", () => {
    const original = { numero_dua: "10030-IC01-2611-002613", numero_igra: null, observaciones: "a", total_fob: 1200.5 };
    expect(camposBloqueadosCambiados(original, { numero_dua: "OTRA", numero_igra: "IGRA1", observaciones: "b", total_fob: "1200.50" }))
      .toEqual(["numero_dua"]);
  });

  it("una hora guardada con segundos que vuelve sin segundos no cuenta como cambio y no se reenvía", () => {
    const original = { liq_siga_termino_at: "2026-11-12T22:24:37+00:00", numero_dua: "X", observaciones: "a" };
    const limpio = payloadGuardadoCompletado(original, { liq_siga_termino_at: "2026-11-12T22:24:00.000Z", numero_dua: "X", observaciones: "b" });
    expect(limpio).toEqual({ observaciones: "b" });
    expect(() => payloadGuardadoCompletado(original, { numero_dua: "Y" })).toThrow(/Expediente Completado/);
  });

  it("factura anterior al 01/11/2026 con saldo: advertencia ámbar con el monto, sin impedir completar", () => {
    const ev = evaluarCierre(base({ facturas: [
      { id: "a", encf: "E310000000100", emision: "2026-10-05", vencimiento: "2026-10-20", monto: 7000, pagado: 0 },
      { id: "b", encf: "E310000000101", emision: "2026-10-10", vencimiento: "2026-12-30", monto: 1500, pagado: 500 },
    ] }), { hoy: "2026-11-17" });
    const cobro = ev.requisitos.find((r) => r.clave === "cobro")!;
    expect(cobro.estado).toBe("aviso");
    expect(cobro.detalle).toContain("RD$8,000.00");
    expect(cobro.detalle).toContain("1 en mora");
    expect(ev.listo).toBe(true);
  });

  it("factura anterior al 01/11/2026 sin saldo: «No aplica»", () => {
    const ev = evaluarCierre(base({ facturas: [{ id: "a", emision: "2026-10-05", monto: 7000, pagado: 7000 }] }), { hoy: "2026-11-17" });
    expect(ev.requisitos.find((r) => r.clave === "cobro")!.estado).toBe("na");
  });
});

describe("Línea de tiempo", () => {
  it("avisa cuando la DUA presentada es anterior a la llegada real", () => {
    expect(lineaTiempoCierre({ llegada: "2026-10-17", presentado: "2026-10-15" }).avisos).toHaveLength(1);
    expect(lineaTiempoCierre({ llegada: "2026-10-17", presentado: "2026-10-17" }).avisos).toHaveLength(0);
  });
});
