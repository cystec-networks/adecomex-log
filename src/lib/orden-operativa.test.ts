import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { datosOperativosOrden, guardarOperativosOrden, operativosOrdenSinCambios } from './orden-operativa';

describe('Datos operativos independientes de la Orden', () => {
  const orden = { origen: 'Amberes', destino: 'Caucedo', incoterm: 'CIF', peso_kg: 143010,
    volumen_m3: null, tarifa_propuesta: 82908, moneda: 'USD', cot_origen: 'Amberes' };
  it('carga los seis valores propios sin perder ceros', () => {
    assert.deepEqual(datosOperativosOrden({ ...orden, volumen_m3: 0 }), {
      origen: 'Amberes', destino: 'Caucedo', incoterm: 'CIF', peso_kg: 143010,
      volumen_m3: 0, tarifa_propuesta: 82908, moneda: 'USD',
    });
  });
  it('corrige PAISES BAJOS sin incluir ni modificar la referencia Amberes', () => {
    const payload = guardarOperativosOrden({ ...datosOperativosOrden(orden), origen: 'PAISES BAJOS' });
    assert.equal(payload.origen, 'PAISES BAJOS');
    assert.equal(orden.cot_origen, 'Amberes');
    assert.equal(Object.keys(payload).some(k => k.startsWith('cot_')), false);
  });
  it('borrar campos propios no recupera la cotización congelada', () => {
    assert.deepEqual(guardarOperativosOrden({ ...datosOperativosOrden(orden), origen: '',
      destino: '', incoterm: '', peso_kg: '', volumen_m3: '', tarifa_propuesta: '' }), {
      origen: null, destino: null, incoterm: null, peso_kg: null, volumen_m3: null,
      tarifa_propuesta: null, moneda: 'USD',
    });
  });
  it('tras guardar, peso escrito como texto y origen con espacios no bloquean la portada', () => {
    const form = { ...datosOperativosOrden(orden), peso_kg: '12.5', origen: ' Amberes ' };
    assert.equal(operativosOrdenSinCambios(form as any, { ...orden, peso_kg: 12.5 }), true);
  });
  it('un peso distinto al guardado sí bloquea la portada', () => {
    const form = { ...datosOperativosOrden(orden), peso_kg: '12.6' };
    assert.equal(operativosOrdenSinCambios(form as any, { ...orden, peso_kg: 12.5 }), false);
  });
});
