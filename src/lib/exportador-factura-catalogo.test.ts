import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { camposProveedorCatalogo, resolverExportadorFactura } from "./exportador-factura-catalogo";

const proveedor = { nombre: "BERKSHIRE DAIRY AND FOOD PRODUCTS", tid: "0007030022", activo: true, rol_siga: "exportadora" as const, pais_nombre: "ESTADOS UNIDOS", pais_codigo: "840", direccion: null, telefono: null, fax: null, email: null };
describe("Exportador leído de factura", () => {
  it("selecciona un nombre exacto con TID y país del catálogo", () => {
    const elegido = resolverExportadorFactura(proveedor.nombre, [proveedor]);
    assert.deepEqual(elegido, proveedor);
    assert.deepEqual(camposProveedorCatalogo(proveedor), { suplidor: proveedor.nombre, suplidor_rnc: "0007030022", pais_origen: "ESTADOS UNIDOS", pais_origen_codigo: "840" });
  });
  it("ignora puntuación, mayúsculas, acentos y sufijos societarios", () => {
    assert.deepEqual(resolverExportadorFactura("Bérkshire Dairy & Food Products, Inc.", [proveedor]), proveedor);
  });
  it("acepta un error menor en un nombre largo único", () => {
    assert.deepEqual(resolverExportadorFactura("BERKSHIRE DAIRY AND FOOD PRODUTS", [proveedor]), proveedor);
  });
  it("mantiene la sugerencia cuando no coincide claramente", () => {
    assert.equal(resolverExportadorFactura("BERKSHIRE", [proveedor]), null);
    assert.equal(resolverExportadorFactura("OTRO SUPLIDOR", [proveedor]), null);
  });
  it("no elige entre empresas muy similares", () => {
    assert.equal(resolverExportadorFactura(proveedor.nombre, [proveedor, { ...proveedor, nombre: "BERKSHIRE DAIRY AND FOOD PRODUCT", tid: "otro" }]), null);
  });
  it("resuelve Exportadora sin mezclar el TID de Productor", () => {
    assert.equal(resolverExportadorFactura(proveedor.nombre, [{ ...proveedor, tid: "270182962", rol_siga: "proveedora_exterior" }, proveedor])?.tid, "0007030022");
  });
  it("conserva sugerencia ante duplicados del mismo rol", () => {
    assert.equal(resolverExportadorFactura(proveedor.nombre, [proveedor, { ...proveedor, tid: "otro" }]), null);
  });
  it("excluye fichas inactivas o sin TID", () => {
    assert.equal(resolverExportadorFactura(proveedor.nombre, [{ ...proveedor, activo: false }, { ...proveedor, tid: "" }]), null);
  });
});