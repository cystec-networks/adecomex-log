import { describe, expect, it } from "vitest";
import {
  TIPO_BL, TIPO_FACTURA_COMERCIAL,
  alertasBlContraFactura, alertasFacturaContraOrden,
  decidirAutocompletadoOperativo, esAutomaticoOperativo, esVacioOperativo,
  etiquetaCampoOperativo, fuenteOperativa,
} from "./autocompletar-operativo";

const bl = (datos: Record<string, unknown>, actual: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  decidirAutocompletadoOperativo({ actual, datos, fuente: "bl", consignatarioCoincide: true, ...extra } as never);
const factura = (datos: Record<string, unknown>, actual: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  decidirAutocompletadoOperativo({ actual, datos, fuente: "factura", consignatarioCoincide: true, ...extra } as never);

describe("autocompletado operativo: qué se llena", () => {
  it("reconoce el BL, la guía aérea y la factura, y nada más", () => {
    expect(fuenteOperativa(TIPO_BL)).toBe("bl");
    expect(fuenteOperativa("Guía aérea")).toBe("bl");
    expect(fuenteOperativa(TIPO_FACTURA_COMERCIAL)).toBe("factura");
    expect(fuenteOperativa("DUA")).toBeNull();
    expect(fuenteOperativa("Certificado de origen")).toBeNull();
  });

  it("completa un campo vacío y avisa del que ya tiene valor", () => {
    const vacio = bl({ naviera: "MAERSK LINE" }, { naviera: "" });
    expect(vacio.cambios.naviera).toBe("MAERSK LINE");
    expect(vacio.completados).toContain("naviera");

    const lleno = bl({ naviera: "MAERSK LINE" }, { naviera: "CLAUDE" });
    expect(lleno.cambios.naviera).toBeUndefined();
    expect(lleno.alertas).toHaveLength(1);
    expect(lleno.alertas[0]).toContain("CLAUDE");
    expect(lleno.alertas[0]).toContain("MAERSK LINE");
  });

  it("un 0 en importes, pesos o bultos cuenta como vacío; en texto no", () => {
    expect(esVacioOperativo("total_fob", 0)).toBe(true);
    expect(esVacioOperativo("otros", 0)).toBe(true);
    expect(esVacioOperativo("peso_bruto", 0)).toBe(true);
    expect(esVacioOperativo("cantidad_bultos", 0)).toBe(true);
    expect(esVacioOperativo("naviera", 0)).toBe(false);

    const r = factura({ fob_total: 12345.67, otros_gastos: 500, seguro: 80, flete: 900 }, { total_fob: 0, otros: 0, seguro: 0, flete: 0 });
    expect(r.cambios.total_fob).toBe(12345.67);
    expect(r.cambios.otros).toBe(500);
    expect(r.cambios.seguro).toBe(80);
    expect(r.cambios.flete).toBe(900);
  });

  it("el N.º de BL solo se llena si el consignatario coincide con el cliente", () => {
    const sin = decidirAutocompletadoOperativo({ actual: {}, datos: { bl: "MSCU1234567" }, fuente: "bl", consignatarioCoincide: false });
    expect(sin.cambios.bl_awb).toBeUndefined();

    const con = decidirAutocompletadoOperativo({ actual: {}, datos: { bl: "MSCU1234567" }, fuente: "bl", consignatarioCoincide: true });
    expect(con.cambios.bl_awb).toBe("MSCU1234567");
  });

  it("el tipo de carga solo se llena con evidencia alta", () => {
    const dudoso = bl({ tipo_carga: "FCL", tipo_carga_confianza: "media" }, {});
    expect(dudoso.cambios.tipo_carga).toBeUndefined();
    expect(dudoso.avisos.join(" ")).toContain("Tipo de carga");

    const seguro = bl({ tipo_carga: "FCL", tipo_carga_confianza: "alta" }, {});
    expect(seguro.cambios.tipo_carga).toBe("FCL");
  });

  it("los contenedores solo entran si el Expediente no tiene ninguno", () => {
    const contenedores = [{ numero: "MSKU1234567", sello1: "S1", sello2: null, tipo: "40HC" }];
    expect(bl({ contenedores }, {}, { contenedoresActuales: 0 }).cambios.contenedores).toHaveLength(1);
    expect(bl({ contenedores }, {}, { contenedoresActuales: 3 }).cambios.contenedores).toBeUndefined();
  });

  it("anota como coincidencia lo que el documento repite", () => {
    const r = bl({ naviera: "MAERSK LINE", peso_bruto_kg: 12000 }, { naviera: "MAERSK LINE", peso_bruto: 12000 });
    expect(r.coincidencias).toEqual(expect.arrayContaining(["naviera", "peso_bruto"]));
    expect(r.alertas).toHaveLength(0);
    expect(Object.keys(r.cambios)).toHaveLength(0);
  });
});

describe("autocompletado operativo: tolerancias de las diferencias", () => {
  it("admite hasta 1% en pesos y alerta a partir de ahí", () => {
    expect(alertasBlContraFactura({ bl: { peso_bruto_kg: 1000 }, factura: { peso_bruto_kg: 1005 }, consignatarioCoincide: true })).toHaveLength(0);
    const d = alertasBlContraFactura({ bl: { peso_bruto_kg: 1000 }, factura: { peso_bruto_kg: 1020 }, consignatarioCoincide: true });
    expect(d.join(" ")).toContain("Peso bruto distinto");
  });

  it("los bultos son exactos y un BL sin bultos no inventa ninguno", () => {
    expect(alertasBlContraFactura({ bl: { cantidad: 12 }, factura: { cantidad: 12 }, consignatarioCoincide: true })).toHaveLength(0);
    expect(alertasBlContraFactura({ bl: { cantidad: 12 }, factura: { cantidad: 13 }, consignatarioCoincide: true }).join(" ")).toContain("Bultos distintos");
    // El peso neto del BL no se confunde con la cantidad de bultos.
    expect(alertasBlContraFactura({ bl: { peso_neto_kg: 9800 }, factura: { cantidad: 13 }, consignatarioCoincide: true })).toHaveLength(0);
  });

  it("los montos son exactos: solo se ignora el redondeo de centavos", () => {
    expect(alertasFacturaContraOrden({ suplidor: "ACME", totalFob: 1000, lineas: [], orden: { suplidor: "ACME", total: 1000.005, lineas: [] } })).toHaveLength(0);
    expect(alertasFacturaContraOrden({ suplidor: "ACME", totalFob: 1000, lineas: [], orden: { suplidor: "ACME", total: 1000.02, lineas: [] } }).join(" ")).toContain("Total distinto");
  });

  it("compara cantidades y precio unitario de cada línea, sin tolerancia", () => {
    const lineas = [{ descripcion: "SILLA MADERA", cantidad: 10, valor: 2500 }];
    const orden = { suplidor: "ACME", total: 2500, lineas: [{ descripcion: "SILLA MADERA", cantidad: 10, valor: 2500 }] };
    expect(alertasFacturaContraOrden({ suplidor: "ACME", totalFob: 2500, lineas, orden })).toHaveLength(0);

    expect(alertasFacturaContraOrden({ suplidor: "ACME", totalFob: 2500, lineas, orden: { ...orden, lineas: [{ descripcion: "SILLA MADERA", cantidad: 11, valor: 2750 }] } }).join(" "))
      .toContain("Cantidad distinta");
    expect(alertasFacturaContraOrden({ suplidor: "ACME", totalFob: 2500, lineas, orden: { ...orden, lineas: [{ descripcion: "SILLA MADERA", cantidad: 10, valor: 2510 }] } }).join(" "))
      .toContain("Precio unitario distinto");
  });

  it("avisa del suplidor distinto y guarda el de la factura sin tocarlo", () => {
    const a = alertasFacturaContraOrden({ suplidor: "OTRO SUPPLIER", totalFob: 100, lineas: [], orden: { suplidor: "ACME", total: 100, lineas: [] } });
    expect(a.join(" ")).toContain("no es el de la Orden");
    const r = factura({ suplidor: "OTRO SUPPLIER" }, { suplidor: "" });
    expect(r.cambios.suplidor).toBe("OTRO SUPPLIER");
  });
});

describe("autocompletado operativo: etiqueta Automático", () => {
  const exp = { naviera: "MAERSK LINE", auto_documento: { naviera: { valor: "MAERSK LINE", fuente: "bl" } } };

  it("se muestra mientras el valor siga siendo el del documento", () => {
    expect(esAutomaticoOperativo(exp, "naviera", "MAERSK LINE")).toBe(true);
    expect(esAutomaticoOperativo({ ...exp, naviera: "CLAUDE" }, "naviera", "CLAUDE")).toBe(false);
    expect(esAutomaticoOperativo(exp, "flete", 0)).toBe(false);
    expect(esAutomaticoOperativo(null, "naviera")).toBe(false);
  });

  it("usa el nombre visible del campo, incluido el código DGA", () => {
    expect(etiquetaCampoOperativo("puerto_salida_codigo")).toBe("Puerto de salida");
    expect(etiquetaCampoOperativo("otros")).toBe("Otros CIF");
    expect(etiquetaCampoOperativo("columna_rara")).toBe("columna_rara");
  });
});
