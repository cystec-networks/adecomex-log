import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coincidenciasClienteDocumento } from './cliente-documento';
import { resolverConfianzaCarga } from './tipo-carga-documento';
const clientes = [{ id: 'bio', nombre: 'BIOAGRO INTERNACIONAL SRL' }, { id: 'otro', nombre: 'OTRO CLIENTE SRL' }];
test('BIOAGRO INTERNATIONAL, S.A. sugiere BIOAGRO INTERNACIONAL SRL como probable', () => {
  assert.deepEqual(coincidenciasClienteDocumento('BIOAGRO INTERNATIONAL, S.A.', clientes), [{ cliente: clientes[0], exacta: false }]);
});
test('razón social, idioma, acentos y mayúsculas no impiden la coincidencia', () => {
  assert.equal(coincidenciasClienteDocumento('agro company, LLC', [{ id: 'a', nombre: 'ÁGRO COMPAÑÍA INC' }])[0]?.cliente.id, 'a');
});
test('nombre base BIOAGRO reconoce la marca sin confundir BIOAGRO NORTE', () => {
  assert.equal(coincidenciasClienteDocumento('BIOAGRO', clientes)[0]?.cliente.id, 'bio');
  assert.equal(coincidenciasClienteDocumento('BIOAGRO NORTE', clientes).length, 0);
});
test('varias fichas equivalentes no eligen la primera automáticamente', () => {
  assert.equal(coincidenciasClienteDocumento('BIOAGRO SA', [...clientes, { id: 'b', nombre: 'BIOAGRO LLC' }]).length, 2);
});
const carga = { tipo_carga: 'FCL', tipo_carga_confianza: 'media' as const, medio_transporte: 'maritimo', cliente: 'BIOAGRO INTERNATIONAL, S.A.', contenedores: [{ numero: 'MSCU1234567' }], tipo_carga_evidencia: { contenedores_completos: 'FULL CONTAINER LOAD, Said to Contain', consignatario_unico: 'Consignee: BIOAGRO INTERNATIONAL, S.A.', consolidada: false, varios_embarcadores: false } };
test('contenedores completos de un consignatario permiten FCL con confianza alta', () => assert.equal(resolverConfianzaCarga(carga).tipo_carga_confianza, 'alta'));
test('solo lista de contenedores sigue siendo ambigua', () => assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_evidencia: { ...carga.tipo_carga_evidencia, contenedores_completos: 'MSCU1234567' } }).tipo_carga_confianza, 'media'));
test('consolidación o varios embarcadores requieren confirmar', () => {
  assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_evidencia: { ...carga.tipo_carga_evidencia, consolidada: true } }).tipo_carga_confianza, 'media');
  assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_evidencia: { ...carga.tipo_carga_evidencia, varios_embarcadores: true } }).tipo_carga_confianza, 'media');
});
test('sin evidencia del mismo consignatario no hay confianza alta', () => assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_evidencia: { ...carga.tipo_carga_evidencia, consignatario_unico: 'OTRO CLIENTE' } }).tipo_carga_confianza, 'media'));
test('un número de BL no se acepta como prueba de contenedor completo', () => assert.equal(resolverConfianzaCarga({ ...carga, contenedores: [{ numero: 'MXO0818860' }] }).tipo_carga_confianza, 'media'));
test('FCL explícito mantiene confianza alta sin exigir evidencia inferida', () => assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_evidencia: { declaracion_tipo: 'CY/CY' } }).tipo_carga_confianza, 'alta'));
test('confianza alta sin evidencia se reduce a media', () => assert.equal(resolverConfianzaCarga({ ...carga, tipo_carga_confianza: 'alta' as const, tipo_carga_evidencia: null }).tipo_carga_confianza, 'media'));