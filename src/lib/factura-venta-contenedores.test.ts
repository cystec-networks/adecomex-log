import { expect, test } from "bun:test";
import { detectarContenedoresFactura, resolverTransporteFactura, guardarContenedoresOcr, contenedoresOcrGuardados, detectarTransportesFactura, guardarTransportesOcr, transportesOcrGuardados, type TransporteContenedores } from "./factura-venta-contenedores";
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
test("una factura anterior permite agregar otra sin eliminar la ambigüedad", () => {
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "MSKU1234567", "otra")]).disponible?.id).toBe("TR1");
  expect(resolverTransporteFactura(["MSKU1234567"], [transporte("TR1", "MSKU1234567", "otra"), transporte("TR2", "MSKU1234567")]).unico).toBe(null);
});
test("reescaneo reemplaza referencias sin tocar notas manuales", () => {
  const notas = guardarContenedoresOcr("Nota del usuario", ["MSKU1234567"]);
  expect(contenedoresOcrGuardados(notas)).toEqual(["MSKU1234567"]);
  const segunda = guardarContenedoresOcr(notas, ["TCLU9876543"]);
  expect(contenedoresOcrGuardados(segunda)).toEqual(["TCLU9876543"]);
  expect(guardarContenedoresOcr(segunda, [])).toBe("Nota del usuario");
});
test("MRSU 210359-7 se compara normalizado contra cualquier separador del Transporte", () => {
  expect(detectarContenedoresFactura(["CONTENEDOR MRSU 210359-7"])).toEqual(["MRSU2103597"]);
  for (const detalle of ["mrsu2103597", "MRSU/210.359-7", "M R S U 2 1 0 3 5 9 7"]) {
    expect(resolverTransporteFactura(["MRSU 210359-7"], [transporte("TR-000065", detalle)]).disponible?.id).toBe("TR-000065");
  }
});
test("reconoce PEDIDO TR-000065 completo sin confundir TF ni completar dígitos", () => {
  expect(detectarTransportesFactura(["PEDIDO TR-000065 / tr-000065 TF-000066 TR-00006 TR-0000657 XTR-000065"])).toEqual(["TR-000065"]);
});
test("TR exacto tiene prioridad sobre un contenedor de otro Transporte", () => {
  const directo = { ...transporte("TR-000065", ""), contenedores_detalle: null };
  expect(resolverTransporteFactura(["MRSU2103597"], [directo, transporte("TR-000066", "MRSU2103597")], ["PEDIDO TR-000065"]).disponible?.id).toBe("TR-000065");
});
test("TR sin coincidencia recurre al contenedor normalizado", () => {
  expect(resolverTransporteFactura(["MRSU 210359-7"], [transporte("TR-000066", "MRSU2103597")], ["TR-000065"]).disponible?.id).toBe("TR-000066");
});
test("TR ambiguo no elige arbitrariamente ni recurre a un contenedor", () => {
  expect(resolverTransporteFactura(["MRSU2103597"], [transporte("TR-000065", "MRSU2103597"), transporte("TR-000066", "")], ["TR-000065", "TR-000066"]).unico).toBe(null);
});
test("TR ya vinculado admite otra factura y mantiene prioridad sobre contenedor", () => {
  expect(resolverTransporteFactura(["MRSU2103597"], [transporte("TR-000065", "", "existente"), transporte("TR-000066", "MRSU2103597")], ["TR-000065"]).disponible?.id).toBe("TR-000065");
});
test("TR000065 y TR-000065 se comparan igual en ambos lados", () => {
  expect(detectarTransportesFactura(["PEDIDO TR000065", "TR-000065"])).toEqual(["TR-000065"]);
  expect(resolverTransporteFactura([], [transporte("TR000065", "")], ["TR-000065"]).disponible?.id).toBe("TR000065");
  expect(resolverTransporteFactura([], [transporte("TR-000065", "")], ["TR000065"]).disponible?.id).toBe("TR-000065");
});
test("ninguna referencia coincidente deja pendiente el vínculo", () => {
  expect(resolverTransporteFactura(["MRSU2103597"], [transporte("TR-000066", "TCLU9876543")], ["TR-000065"]).unico).toBe(null);
});
test("referencias TR se conservan separadas del contenedor y se reemplazan al reescanear", () => {
  const notas = guardarTransportesOcr(guardarContenedoresOcr("Nota manual", ["MRSU2103597"]), ["PEDIDO TR-000065"]);
  expect(transportesOcrGuardados(notas)).toEqual(["TR-000065"]);
  expect(contenedoresOcrGuardados(notas)).toEqual(["MRSU2103597"]);
  const segunda = guardarTransportesOcr(notas, ["TR-000066"]);
  expect(transportesOcrGuardados(segunda)).toEqual(["TR-000066"]);
  expect(guardarTransportesOcr(segunda, [])).toBe(guardarContenedoresOcr("Nota manual", ["MRSU2103597"]));
});