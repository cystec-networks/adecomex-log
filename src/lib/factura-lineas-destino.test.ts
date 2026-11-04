import { test, expect } from 'bun:test';
import { facturaMixta, importeLineaDestino, resolverTransporteAcotado } from './factura-lineas-destino';
const t = (id: string, exp: string) => ({ id, expediente_id: exp, numero_viaje: id, contenedores_detalle: 'UETU 594001-5', factura_ecf_id: null, factura_numero: null, factura_fecha: null, ingreso_facturado: null });
test('gestión y transporte son destinos independientes de una factura mixta', () => {
  expect(facturaMixta([{descripcion:'Servicios de gestión'}, {descripcion:'Servicios de Transporte'}])).toBe(true);
  expect(importeLineaDestino({descripcion:'Servicios de Transporte', cantidad:1, precio:16000, itbis:0, descuento:0, recargo:0, gravado:false, unidad:'UND'})).toBe(16000);
});
test('contenedor UETU5940015 prioriza el expediente 202610I371 frente a otro viaje', () => {
  expect(resolverTransporteAcotado(['UETU5940015'], [t('TR-000001','371'),t('TR-000002','otro')], [], '371').unico?.id).toBe('TR-000001');
});
test('TR exacto conserva prioridad incluso sobre el contenedor acotado', () => {
  expect(resolverTransporteAcotado(['UETU5940015'], [t('TR-000001','371'),t('TR-000002','otro')], ['TR000002'], '371').unico?.id).toBe('TR-000002');
});
test('dos viajes en el mismo expediente quedan pendientes, no elige el global', () => {
  expect(resolverTransporteAcotado(['UETU5940015'], [t('TR-000001','371'),t('TR-000002','371')], [], '371').unico).toBe(null);
});
test('sin transporte se mantiene la gestión identificada y su importe 8500', () => {
  expect(resolverTransporteAcotado(['UETU5940015'], [], [], '371').unico).toBe(null);
  expect(importeLineaDestino({descripcion:'Servicios de gestión', cantidad:1, precio:8500, itbis:0, descuento:0, recargo:0, gravado:false, unidad:'UND'})).toBe(8500);
});