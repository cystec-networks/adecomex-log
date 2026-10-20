import { describe, expect, it } from "vitest";
import { construirObservaciones, contenedoresValidos, normalizarRemarkSiga } from "./observaciones-expediente";
import { buildImportDUAXml } from "./siga-xml";

const ej = { tipo_carga: "FCL", contenedores: "4x40", descripcion: "3,840 fundas de leche descremada en polvo", embarcador: "Melkweg Holland BV" };

describe("observaciones estructuradas", () => {
  it("coincide con el ejemplo real", () => {
    expect(normalizarRemarkSiga(construirObservaciones(ej, "20263993", "202609I322"))).toBe(
      "FCL 4X40 STC: 3,840 FUNDAS DE LECHE DESCREMADA EN POLVO, EMB.: MELKWEG HOLLAND BV, FACTURA 20263993, EXP.: 202609I322.",
    );
  });
  it("sin embarcador no deja comas dobles", () => {
    expect(construirObservaciones({ ...ej, embarcador: "  " }, "F1", "E1")).toBe(
      "FCL 4X40 STC: 3,840 fundas de leche descremada en polvo, FACTURA F1, EXP.: E1.",
    );
  });
  it("quita tildes, Ñ y saltos de línea", () => {
    expect(normalizarRemarkSiga("Piñas\nacción  café")).toBe("PINAS ACCION CAFE");
  });
  it("valida NxTT", () => {
    expect(contenedoresValidos("2X40")).toBe(true);
    expect(contenedoresValidos("1x20")).toBe(true);
    expect(contenedoresValidos("dos de 40")).toBe(false);
  });
  it("Remark va en ImpDeclaration, normalizado y escapado", () => {
    const xml = buildImportDUAXml(
      { numero: "E1", observaciones: "FCL STC: x, EMB.: A & B Ñandú", clientes: {} } as any,
      [{ item_no: 1, detalle_producto: "Leche & más" }] as any,
      {} as any,
    );
    const decl = xml.split("<ImpDeclarationProduct>")[0];
    expect(decl).toContain("<Remark>FCL STC: X, EMB.: A &amp; B NANDU</Remark>");
    expect(xml).toContain("<Remark>Leche &amp; más</Remark>");
  });
});
