import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { construirObservaciones, contenedoresValidos, normalizarRemarkSiga, contenedoresDesdeTabla, tipoCargaPorDefecto, descripcionBorrador } from "./observaciones-expediente";
import { buildImportDUAXml } from "./siga-xml";

const ej = { tipo_carga: "FCL", contenedores: "4x40", descripcion: "3,840 fundas de leche descremada en polvo", embarcador: "Melkweg Holland BV" };

describe("observaciones estructuradas", () => {
  it("coincide con el ejemplo real", () => {
    assert.equal(normalizarRemarkSiga(construirObservaciones(ej, "20263993", "202609I322")), 
      "FCL 4X40 STC: 3,840 FUNDAS DE LECHE DESCREMADA EN POLVO, EMB.: MELKWEG HOLLAND BV, FACTURA 20263993, EXP.: 202609I322.",
    );
  });
  it("sin embarcador no deja comas dobles", () => {
    assert.equal(construirObservaciones({ ...ej, embarcador: "  " }, "F1", "E1"), 
      "FCL 4X40 STC: 3,840 fundas de leche descremada en polvo, FACTURA F1, EXP.: E1.",
    );
  });
  it("quita tildes, Ñ y saltos de línea", () => {
    assert.equal(normalizarRemarkSiga("Piñas\nacción  café"), "PINAS ACCION CAFE");
  });
  it("valida NxTT", () => {
    assert.equal(contenedoresValidos("2X40"), true);
    assert.equal(contenedoresValidos("1x20"), true);
    assert.equal(contenedoresValidos("dos de 40"), false);
  });
  it("Remark va en ImpDeclaration, normalizado y escapado", () => {
    const xml = buildImportDUAXml(
      { numero: "E1", observaciones: "FCL STC: x, EMB.: A & B Ñandú", clientes: {} } as any,
      [{ item_no: 1, detalle_producto: "Leche & más" }] as any,
      {} as any,
    );
    const decl = xml.split("<ImpDeclarationProduct>")[0];
    assert.ok((decl).includes("<Remark>FCL STC: X, EMB.: A &amp; B NANDU</Remark>"));
    assert.ok((xml).includes("<Remark>Leche &amp; más</Remark>"));
  });
  it("contenedores mixtos y únicos desde la tabla", () => {
    assert.equal(contenedoresDesdeTabla([{ tipo: "40'" }, { tipo: "20 DRY" }]), "1X40 + 1X20");
    assert.equal(contenedoresDesdeTabla([{ tipo: "40" }, { tipo: "40" }]), "2X40");
    assert.equal(contenedoresDesdeTabla([{ tipo: "" }]), "");
    assert.equal(contenedoresValidos("1X40 + 1X20"), true);
  });
  it("tipo de carga por defecto", () => {
    assert.equal(tipoCargaPorDefecto(2), "FCL");
    assert.equal(tipoCargaPorDefecto(0), "LCL");
  });
  it("borrador usa el producto de mayor FOB", () => {
    assert.equal(descripcionBorrador([{ detalle_producto: "A", valor_fob: 10 }, { detalle_producto: "Leche", valor_fob: 90 }]), "Leche");
  });
  it("texto con contenedores mixtos", () => {
    assert.ok(construirObservaciones({ tipo_carga: "FCL", contenedores: "1x40+1x20" }).startsWith("FCL 1X40 + 1X20"));
  });
});
