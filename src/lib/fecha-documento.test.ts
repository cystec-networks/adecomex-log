import { describe, expect, it } from "vitest";
import { fechaDocumentoIso, normalizarFechasLectura } from "./fecha-documento";

describe("fechas de documentos: siempre día/mes/año", () => {
  it("una fecha numérica se lee como día/mes/año", () => {
    expect(fechaDocumentoIso("03/11/2026")).toBe("2026-11-03");
    expect(fechaDocumentoIso("3.11.26")).toBe("2026-11-03");
    expect(fechaDocumentoIso("13-11-2026")).toBe("2026-11-13");
  });

  it("si no cabe en día/mes/año no se inventa nada", () => {
    expect(fechaDocumentoIso("11/13/2026")).toBeNull();
    expect(fechaDocumentoIso("31/02/2026")).toBeNull();
    expect(fechaDocumentoIso("sin fecha")).toBeNull();
  });

  it("acepta año primero y meses con nombre", () => {
    expect(fechaDocumentoIso("2026-11-03")).toBe("2026-11-03");
    expect(fechaDocumentoIso("03-NOV-2026")).toBe("2026-11-03");
    expect(fechaDocumentoIso("3 de noviembre de 2026")).toBe("2026-11-03");
    expect(fechaDocumentoIso("Nov 3, 2026")).toBe("2026-11-03");
  });

  it("corrige día y mes invertidos por el lector con la fecha impresa (caso 202610I390)", () => {
    const r = normalizarFechasLectura({ fecha_cargado: "2026-03-11", fecha_cargado_texto: "03/11/2026", eta: null, eta_texto: null });
    expect(r.fecha_cargado).toBe("2026-11-03");
    expect(r.eta).toBeNull();
  });

  it("sin fecha impresa conserva solo una fecha ISO válida", () => {
    expect(normalizarFechasLectura({ fecha_cargado: "2026-11-03" }).fecha_cargado).toBe("2026-11-03");
    expect(normalizarFechasLectura({ fecha_cargado: "2026-02-31" }).fecha_cargado).toBeNull();
  });
});

describe("Fecha de carga del BL: embarque a bordo, nunca emisión", () => {
  it("BL 202611I403: «Shipped on Board CMA CGM FIORDLAND 08-NOV-2026» → 08/11/2026", () => {
    const r = normalizarFechasLectura({ fecha_cargado: "2026-11-08", fecha_cargado_texto: "08-NOV-2026", fecha_cargado_etiqueta: "Shipped on Board CMA CGM FIORDLAND", medio_transporte: "maritimo" });
    expect(r.fecha_cargado).toBe("2026-11-08");
  });

  it("si el lector tomó la fecha de emisión, la Fecha de carga queda vacía", () => {
    const r = normalizarFechasLectura({ fecha_cargado: "2026-11-08", fecha_cargado_texto: "08 NOV 2026", fecha_cargado_etiqueta: "Place and Date of Issue ANTWERP", medio_transporte: "maritimo" });
    expect(r.fecha_cargado).toBeNull();
  });

  it("si la tomó de «Received for shipment», también queda vacía", () => {
    expect(normalizarFechasLectura({ fecha_cargado: "2026-11-01", fecha_cargado_etiqueta: "Received for shipment", medio_transporte: "maritimo" }).fecha_cargado).toBeNull();
  });

  it("«Laden on board» y «Fecha de embarque» se aceptan", () => {
    expect(normalizarFechasLectura({ fecha_cargado: "2026-11-05", fecha_cargado_etiqueta: "Laden on board the vessel" }).fecha_cargado).toBe("2026-11-05");
    expect(normalizarFechasLectura({ fecha_cargado: "2026-11-05", fecha_cargado_etiqueta: "Fecha de embarque" }).fecha_cargado).toBe("2026-11-05");
  });
});
