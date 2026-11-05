import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCollectCharges, sumarOtrosDocumentos } from './bl-collect-charges';
test('DTHC USD 400.00 completa Otros con 400', () => assert.equal(leerCollectCharges('Collect Charges\nTERMINAL HANDLING CHARGE (DTHC: USD 400.00)'), 400));
test('todos los cargos de destino se suman sin duplicar subtotal/total', () => assert.equal(leerCollectCharges('Collect Charges\nTERMINAL HANDLING CHARGE (DTHC: USD 400.00)\nDOCUMENTATION CHARGE USD 75.00\nSECURITY CHARGE USD 25.50\nSUBTOTAL USD 500.50\nTOTAL COLLECT USD 500.50'), 500.5));
test('cabecera USD aplica a cargos sin moneda por fila', () => assert.equal(leerCollectCharges('Collect Charges (USD)\nDTHC 400.00\nDocumentation 75.00'), 475));
test('cargos prepaid y otras monedas no entran en Otros USD', () => {
  assert.equal(leerCollectCharges('Prepaid Charges\nDTHC USD 400.00'), null);
  assert.equal(leerCollectCharges('Collect Charges\nDTHC EUR 400.00\nDocumentation $75.00'), null);
  assert.equal(leerCollectCharges('Collect Charges\nDTHC USD 400.00\nPrepaid Charges\nFreight USD 2000.00'), 400);
});
test('no multiplica tarifas ni duplica un total sin detalle', () => {
  assert.equal(leerCollectCharges('Collect Charges\nDTHC USD 400.00 per container\nTotal USD 800.00'), null);
});
test('BL y factura suman sus cargos y relectura no acumula nuevamente', () => {
  assert.equal(sumarOtrosDocumentos(400, 50), 450);
  assert.equal(sumarOtrosDocumentos(400, 50), 450);
  assert.equal(sumarOtrosDocumentos(null, 50), 50);
  assert.equal(sumarOtrosDocumentos(0, null), 0);
  assert.equal(sumarOtrosDocumentos(null, null), null);
});