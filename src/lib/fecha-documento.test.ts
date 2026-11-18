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
