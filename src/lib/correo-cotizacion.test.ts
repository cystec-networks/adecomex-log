import { describe, it, expect } from 'bun:test';
import { sugerirCotizacionCorreo, tipoDocumentoCompra } from './correo-cotizacion';
describe('Conversión manual a compra', () => {
  const proforma = { tipo: 'Factura comercial', nombre: 'Maguana proforma I-52069.pdf' };
  it('sugiere solo proforma sin BL ni ETA, incluyendo borradores antiguos', () => {
    expect(sugerirCotizacionCorreo({ bl_awb: null, eta: null, adjuntos: [proforma] })).toBe(true);
    expect(sugerirCotizacionCorreo({ bl_awb: 'MXO0813739', adjuntos: [proforma] })).toBe(false);
    expect(sugerirCotizacionCorreo({ eta: '2026-11-17', adjuntos: [proforma] })).toBe(false);
  });
  it('no sugiere cuando hay otros tipos reconocidos o no hay proforma', () => {
    expect(sugerirCotizacionCorreo({ adjuntos: [proforma, { tipo: 'Bill of Lading' }] })).toBe(false);
    expect(sugerirCotizacionCorreo({ adjuntos: [{ tipo: 'Factura comercial' }] })).toBe(false);
    expect(sugerirCotizacionCorreo({ adjuntos: [] })).toBe(false);
  });
  it('reconoce Factura Proforma como tipo independiente', () => {
    expect(tipoDocumentoCompra({ tipo: 'Proforma Invoice' })).toBe('Factura proforma');
  });
});