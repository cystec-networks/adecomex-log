import { expect, test } from "bun:test";
import { detectarReferenciasFactura, decidirVinculoFactura, coincideFacturaExpediente, guardarDescripcionesOcr, descripcionesOcrGuardadas } from "./factura-venta-referencias";

test("E310000000358 detecta un único EXP aunque VUCE no lo repita y conserva BL", () => {
  const r = detectarReferenciasFactura(["HONORARIOS GESTIONES ADUANALES, EXP. 202610I374 - BL 703-13724200 - FERMENTOS.", "PERMISO VUCE"]);
  expect(r).toEqual({ expedientes: ["202610I374"], bl: ["703-13724200"], unico: "202610I374" });
  expect(decidirVinculoFactura(r, [{ id: "exp", numero: "202610I374", factura_ecf_id: null }])).toBe("exp");
});
test("varias líneas con el mismo EXP permiten vínculo único", () => {
  expect(detectarReferenciasFactura(["EXP 202610I374", "exp. 202610i374"]).unico).toBe("202610I374");
});
test("varios expedientes no vinculan y cada coincidencia sigue disponible en Finanzas", () => {
  const ds = ["EXP. 202610I374", "EXP 202610I360"];
  const r = detectarReferenciasFactura(ds);
  expect(r.expedientes).toEqual(["202610I374", "202610I360"]);
  expect(decidirVinculoFactura(r, [{ id: "exp", numero: "202610I374", factura_ecf_id: null }])).toBe(null);
  expect(coincideFacturaExpediente(ds, "202610I374")).toBe(true);
  expect(coincideFacturaExpediente(ds, "202610I352")).toBe(false);
});
test("sin EXP o solo BL mantiene Sin vincular", () => {
  expect(detectarReferenciasFactura(["BL 703-13724200", "HONORARIOS"]).unico).toBe(null);
});
test("no sustituye otra factura y no selecciona expediente inexistente", () => {
  const r = detectarReferenciasFactura(["EXP 202610I374"]);
  expect(decidirVinculoFactura(r, [{ id: "exp", numero: "202610I374", factura_ecf_id: "otra" }], "actual")).toBe(null);
  expect(decidirVinculoFactura(r, [])).toBe(null);
});
test("referencias OCR persisten sin cambiar líneas fiscales ni notas manuales y reescaneo reemplaza", () => {
  const notas = guardarDescripcionesOcr("Nota manual EXP 202610I360", ["EXP. 202610I374"]);
  expect(notas.startsWith("Nota manual EXP 202610I360")).toBe(true);
  expect(detectarReferenciasFactura(descripcionesOcrGuardadas(notas)).unico).toBe("202610I374");
  const segunda = guardarDescripcionesOcr(notas, ["EXP 202610I352"]);
  expect(detectarReferenciasFactura(descripcionesOcrGuardadas(segunda)).expedientes).toEqual(["202610I352"]);
  expect(descripcionesOcrGuardadas("Nota manual EXP 202610I360")).toEqual([]);
});