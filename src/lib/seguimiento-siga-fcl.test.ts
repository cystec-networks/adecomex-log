import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/seguimiento-siga-portal-fcl.json";
import lcl from "./__fixtures__/seguimiento-siga-portal.json";
import {
  blParaEmparejar, decidirSeguimientoSiga, diferenciasAlertaSiga, leerSeguimientoSigaCeldas, mismoRnc, normalizarControlCarga, validarSeguimientoSiga,
  type ItemPosicion,
} from "./seguimiento-siga";
import { clasificarProcesos } from "./seguimiento-siga-evaluar";

const pag = (f: { items: unknown }) => (f.items as Array<Array<[string, number, number, number, number]>>).map((p) => p.map(([str, x, y, w, h]) => ({ str, x, y, w, h }) as ItemPosicion));
// PDF real del 202610I391 (FCL ya despachado, Tipo de BL Simple, sin BL hijo).
const d = leerSeguimientoSigaCeldas(pag(fixture), fixture.texto)!;
const l = leerSeguimientoSigaCeldas(pag(lcl), lcl.texto)!;

// Datos del Expediente 202610I391 tal como están registrados.
const exp391 = {
  bl_awb: "ONEYRICGGG877600", puerto_arribo: "CAUCEDO", puerto_arribo_codigo: "DOCAU", estado: "facturar",
  numero_dua: "10150-IC01-2611-00113C", numero_igra: "IGRA20261115233", fecha_llegada_real: "2026-11-11", peso_bruto: 77392.7,
  cantidad_bultos: null, area_aduanera: "ADMINISTRACION PUERTO MULTIMODAL CAUCEDO", area_aduanera_codigo: "10150",
  descripcion_mercancia: "FCL 4X40 STC: 3,059 FUNDAS DE LECHE EN POLVO DESCREMADA",
};
const cliente391 = [{ nombre: "AGROLACTEOS IMANFA SRL", rnc: "130267901" }];

describe("Seguimiento SIGA FCL (202610I391) con reglas fijas", () => {
  it("lee el reporte sin BL hijo", () => { expect(d).not.toBeNull(); expect(d.bl_hijo).toBeNull(); expect(d.bl_madre).toBe("ONEYRICGGG877600"); expect(d.tipo_bl).toBe("Simple"); });
  it("lee los procesos Despacho y Declaración de Importación con Creado y Procesado", () => {
    expect(d.procesos.map((p) => [p.proceso, p.numero_solicitud, p.fecha_creacion ?? null, p.fecha, p.estado])).toEqual([
      ["despacho", "IGRA20261115233", "2026-11-12T11:58", "2026-11-14T20:31", "Completo"],
      ["declaracion_importacion", "10150-IC01-2611-00113C", "2026-11-14T10:15", "2026-11-14T10:15", "Despacho Aprobado"],
      ["entrada", "IGEA2026112785", "2026-11-11T14:07", "2026-11-11T14:07", "Completo"],
      ["manifiesto_madre", "IGMM2026110435", "2026-11-07T22:01", "2026-11-11T14:07", "Confirmación de recepción"],
    ]);
  });
  it("completa el documento de embarque cortado con el BL del reporte", () => expect(d.procesos.every((p) => p.doc_embarque === "ONEYRICGGG877600")).toBe(true));
  it("toma N.º de despacho, DUA y fecha de despacho completo", () => {
    expect(d.numero_despacho).toBe("IGRA20261115233"); expect(d.numero_dua).toBe("10150-IC01-2611-00113C"); expect(d.despacho_fecha).toBe("2026-11-14T20:31");
  });
});

describe("Regla 1: emparejamiento", () => {
  it("Tipo de BL Simple sin hijo empareja por el BL del documento", () => {
    expect(blParaEmparejar(d)).toMatchObject({ bl: "ONEYRICGGG877600", fuente: "simple" });
    expect(validarSeguimientoSiga(exp391, cliente391, d)).toMatchObject({ ok: true, bl: "coincide", cliente: "coincide", puerto: "coincide" });
  });
  it("consolidado (D/E Hijo) usa solo el hijo, nunca el madre", () => {
    expect(blParaEmparejar(l)).toMatchObject({ bl: "INCO78091126", fuente: "hijo" });
    expect(validarSeguimientoSiga({ bl_awb: "SMLU9300658A", puerto_arribo: "RIO HAINA" }, [{ nombre: "AGRODETALLES SRL" }], l).bl).toBe("no_coincide");
  });
  it("consolidado sin hijo no empareja y dice por qué", () => {
    const r = blParaEmparejar({ bl_hijo: null, bl_madre: "SMLU9300658A", tipo_bl: "D/E Hijo" });
    expect(r.bl).toBeNull(); expect(r.motivo).toMatch(/sin BL hijo/);
  });
  it("BL distinto: «No se encontró el BL en el Expediente»", () =>
    expect(validarSeguimientoSiga({ ...exp391, bl_awb: "MSCU1234567" }, cliente391, d).errores[0]).toMatch(/^No se encontró el BL en el Expediente/));
});

describe("Reglas 2, 3, 5 y 6", () => {
  it("No. de Control de Carga con y sin sufijo", () => {
    expect(d.control_carga).toBe("26199500592402509-0104"); expect(l.control_carga).toBe("26199501193800801-0108-001");
    expect(normalizarControlCarga("26199500592402509-0104")).toBe("26199500592402509-0104");
    expect(normalizarControlCarga("2619950119380080 1-0108-001")).toBe("26199501193800801-0108-001");
  });
  it("bultos: solo el número (SIGA dice PALETAS aunque sean fundas)", () => {
    expect(d.bultos).toBe(3059);
    expect(decidirSeguimientoSiga({ ...exp391, cantidad_bultos: 3059 }, d).coincidentes).toContain("cantidad_bultos");
  });
  it("bandera y Puerto de Descarga solo informativos", () => {
    const r = decidirSeguimientoSiga(exp391, d);
    expect(r.cambios).not.toHaveProperty("siga_bandera");
    expect(r.informativos.map((i) => i.campo)).toEqual(expect.arrayContaining(["siga_bandera", "puerto_descarga"]));
  });
  it("RNC por los últimos 9 dígitos", () => {
    expect(mismoRnc("RNC214130267901", "130267901")).toBe(true);
    expect(mismoRnc("RNC214130267901", "130267902")).toBe(false);
    expect(validarSeguimientoSiga(exp391, [{ nombre: "OTRO NOMBRE", rnc: "130267901" }], d).cliente).toBe("coincide");
  });
});

describe("Regla 4 y 10: vista previa del 202610I391", () => {
  const r = decidirSeguimientoSiga(exp391, d);
  it("no propone cambios sobre datos que ya coinciden", () => {
    for (const k of ["fecha_llegada_real", "numero_dua", "numero_igra", "peso_bruto", "area_aduanera"]) expect(r.cambios).not.toHaveProperty(k);
    expect(r.coincidentes).toEqual(expect.arrayContaining(["fecha_llegada_real", "numero_dua", "numero_igra", "peso_bruto"]));
    expect(r.diferencias).toEqual([]);
  });
  it("solo agrega los datos SIGA nuevos", () => expect(Object.keys(r.cambios).sort()).toEqual([
    "cantidad_bultos", "siga_administracion", "siga_bl_madre", "siga_buque", "siga_control_carga", "siga_empresa_transportista", "siga_fecha_llegada", "siga_viaje",
  ]));
  it("la descripción en otro idioma es informativa, no roja", () => {
    expect(diferenciasAlertaSiga(exp391, d)).toEqual([]);
    expect(r.informativos.find((i) => i.campo === "descripcion_mercancia")?.siga).toBe("NONFAT DRY MILK POWDER");
  });
  it("completa N.º de despacho y DUA solo si están vacíos", () => {
    const v = decidirSeguimientoSiga({ ...exp391, numero_dua: "", numero_igra: null }, d);
    expect(v.cambios).toMatchObject({ numero_igra: "IGRA20261115233", numero_dua: "10150-IC01-2611-00113C" });
    const m = decidirSeguimientoSiga({ ...exp391, numero_igra: "IGRA20269999999" }, d);
    expect(m.cambios).not.toHaveProperty("numero_igra"); expect(m.diferencias.map((x) => x.campo)).toEqual(["numero_igra"]);
  });
});

describe("Regla 7: procesos existentes se actualizan, no se duplican", () => {
  const previos = [{ proceso: "despacho", numero_solicitud: "IGRA20261115233", fecha_texto: "2026-11-12T11:58", fecha_creacion_texto: null, estado: "Registro" },
    { proceso: "entrada", numero_solicitud: "IGEA2026112785", fecha_texto: "2026-11-11T14:07", fecha_creacion_texto: "2026-11-11T14:07", estado: "Completo" }];
  const c = clasificarProcesos(d.procesos, previos);
  it("mismo proceso y número con estado/fechas nuevos: se actualiza", () => expect(c.actualizados.map((p) => p.proceso)).toEqual(["despacho"]));
  it("igual: ya registrado; distinto: nuevo", () => expect(c.nuevos.map((p) => p.proceso)).toEqual(["declaracion_importacion", "manifiesto_madre"]));
});
