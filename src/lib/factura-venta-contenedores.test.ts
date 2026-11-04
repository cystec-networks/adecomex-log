import { expect, test } from "bun:test";
import { detectarContenedoresFactura, resolverTransporteFactura, guardarContenedoresOcr, contenedoresOcrGuardados, type TransporteContenedores } from "./factura-venta-contenedores";
const transporte = (id: string, detalle: string, factura: string | null = null): TransporteContenedores => ({ id, numero_viaje: id, contenedores_detalle: detalle, factura_ecf_id: factura, factura_numero: null, factura_fecha: null, ingreso_facturado: null });
test("extrae los ejemplos ISO completos, normaliza y deduplica sin inventar dígitos", () => {
  expect(detectarContenedoresFactura(["MSKU1234567, tclu 9876543, MSKU-1234567, MSKU123456, XMSKU1234567, MSKU12345678"])).toEqual(["MSKU1234567", "TCLU9876543"]);
});
test("un contenedor coincidente autoriza un único Transporte", () => {
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "40 pies MSKU1234567"), transporte("TR2", "TCLU9876543")]).disponible?.id).toBe("TR1");
});
test("el mismo contenedor en varios Transportes exige selección manual", () => {
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "MSKU1234567"), transporte("TR2", "MSKU1234567")]).disponible).toBe(null);
});
test("sin coincidencia no vincula", () => {
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "TCLU9876543")]).unico).toBe(null);
});
test("varios contenedores en un único Transporte permiten vínculo", () => {
  expect(resolverTransporteFactura(["MSKU1234567", "TCLU9876543"], [transporte("TR1", "MSKU1234567 / TCLU9876543")]).disponible?.id).toBe("TR1");
});
test("contenedores de dos Transportes distintos no eligen uno arbitrariamente", () => {
  expect(resolverTransporteFactura(["MSKU1234567", "TCLU9876543"], [transporte("TR1", "MSKU1234567"), transporte("TR2", "TCLU9876543")]).unico).toBe(null);
});
test("no reemplaza la factura existente ni elimina ambigüedad por filtrar vinculados", () => {
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "MSKU1234567", "otra")]).disponible).toBe(null);
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "MSKU1234567", "otra"), transporte("TR2", "MSKU1234567")]).unico).toBe(null);
});
test("reescaneo reemplaza referencias sin tocar notas manuales", () => {
  const notas = guardarContenedoresOcr("Nota del usuario", ["MSKU1234567"]);
  expect(contenedoresOcrGuardados(notas)).toEqual(["MSKU1234567"]);
  const segunda = guardarContenedoresOcr(notas, ["TCLU9876543"]);
  expect(contenedoresOcrGuardados(segunda)).toEqual(["TCLU9876543"]);
  expect(guardarContenedoresOcr(segunda, [])).toBe("Nota del usuario");
});