import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirCotizacionCorreo, tipoDocumentoCompra } from './correo-cotizacion';
describe('Conversión manual a compra', () => {
  const proforma = { tipo: 'Factura comercial', nombre: 'Maguana proforma I-52069.pdf' };
  it('sugiere solo proforma sin BL ni ETA, incluyendo borradores antiguos', () => {
    assert.equal(sugerirCotizacionCorreo({ bl_awb: null, eta: null, adjuntos: [proforma] }), true);
    assert.equal(sugerirCotizacionCorreo({ bl_awb: 'MXO0813739', adjuntos: [proforma] }), false);
    assert.equal(sugerirCotizacionCorreo({ eta: '2026-11-17', adjuntos: [proforma] }), false);
  });
  it('no sugiere cuando hay otros tipos reconocidos o no hay proforma', () => {
    assert.equal(sugerirCotizacionCorreo({ adjuntos: [proforma, { tipo: 'Bill of Lading' }] }), false);
    assert.equal(sugerirCotizacionCorreo({ adjuntos: [{ tipo: 'Factura comercial' }] }), false);
    assert.equal(sugerirCotizacionCorreo({ adjuntos: [] }), false);
  });
  it('reconoce Factura Proforma como tipo independiente', () => {
    assert.equal(tipoDocumentoCompra({ tipo: 'Proforma Invoice' }), 'Factura proforma');
  });
});