import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarMonedaFactura, normalizarTotalFactura } from './factura-importes';

describe('Importes documentales de proforma', () => {
  it('conserva el total final sin conversión ni recálculo', () => {
    assert.equal(normalizarTotalFactura(61100), 61100);
    assert.equal(normalizarTotalFactura(196593.75), 196593.75);
    assert.equal(normalizarTotalFactura(null), null);
  });
  it('conserva la moneda explícita distinta de USD', () => {
    assert.equal(normalizarMonedaFactura('EUR'), 'EUR');
    assert.equal(normalizarMonedaFactura('RD$'), 'DOP');
    assert.equal(normalizarMonedaFactura('US$'), 'USD');
    assert.equal(normalizarMonedaFactura('$'), null);
  });
});