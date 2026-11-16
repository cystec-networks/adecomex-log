import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/seguimiento-siga-portal.json";
import { leerSeguimientoSigaCeldas, type ItemPosicion } from "./seguimiento-siga";

// Posiciones reales del PDF del portal SIGA (202611I413, LCL): columnas mezcladas en el texto plano.
const paginas: ItemPosicion[][] = (fixture.items as Array<Array<[string, number, number, number, number]>>)
  .map((p) => p.map(([str, x, y, w, h]) => ({ str, x, y, w, h })));
const d = leerSeguimientoSigaCeldas(paginas, fixture.texto)!;

describe("Seguimiento SIGA del portal: lectura por celdas sin IA", () => {
  it("lee el reporte real con reglas fijas", () => expect(d).not.toBeNull());
  it("separa BL madre y Doc.Embarque Hijo", () => { expect(d.bl_madre).toBe("SMLU9300658A"); expect(d.bl_hijo).toBe("INCO78091126"); });
  it("une el No. de Control de Carga partido en dos renglones", () => expect(d.control_carga).toBe("26199501193800801-0108-001"));
  it("toma la terminal de la columna Localización, no del puerto", () => expect(d.terminal).toBe("TERMINALES HAINA S.A (MARITIMA DOMINICANA)"));
  it("no confunde Puerto de Descarga con Puerto de Desembarque", () => { expect(d.puerto_desembarque).toBe("RIO HAINA"); expect(d.puerto_descarga).toBe("MANZANILLO"); });
  it("lee buque, viaje, transportista, bandera y administración", () => {
    expect(d.buque).toBe("SEABOARD VIKING"); expect(d.viaje).toBe("21B"); expect(d.empresa_transportista).toBe("SEADOM SAS");
    expect(d.bandera).toBe("LIBERIA"); expect(d.administracion).toBe("ADMINISTRACION HAINA ORIENTAL");
  });
  it("lee llegada con hora local, peso y bultos", () => { expect(d.fecha_llegada).toBe("2026-11-12T18:24"); expect(d.peso_bruto).toBe(1220); expect(d.bultos).toBe(1); });
  it("registra los cinco procesos con número, fecha y estado", () => {
    expect(d.procesos.map((p) => [p.proceso, p.numero_solicitud, p.fecha, p.estado])).toEqual([
      ["transportacion", "IGTR2026115243", "2026-11-14T11:32", "Registro"],
      ["entrada", "IGEA2026115090", "2026-11-13T13:59", "Registro"],
      ["manifiesto_consolidado", "26199501193800801-0108", "2026-11-13T13:58", "Confirmación de recepción"],
      ["entrada", "IGEA2026114461", "2026-11-13T13:03", "Completo"],
      ["manifiesto_madre", "IGMM2026110661", "2026-11-11T19:31", "Confirmación de recepción"],
    ]);
  });
  it("sin el título del reporte no lee nada", () => expect(leerSeguimientoSigaCeldas(paginas, "Otro documento")).toBeNull());
});
