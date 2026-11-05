import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Read-only contract tests against the deployed increment function; no counters or records are changed.
describe('Expedientes — secuencia final del último guardado', { skip: !process.env.NUMERACION_TEST_TOKEN }, () => {
  const incrementar = async (numero: string) => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = process.env.NUMERACION_TEST_TOKEN;
    assert.ok(url && key && token);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    return db.rpc('incrementar_numero_expediente', { p_numero: numero });
  };
  it('conserva 202610I y sugiere exactamente 383 después de 382', async () => {
    const result = await incrementar('202610I382');
    assert.ifError(result.error);
    assert.equal(result.data, '202610I383');
  });
  it('sigue el nuevo prefijo escrito manualmente sin validar mes, año o tipo', async () => {
    const result = await incrementar('202799E41');
    assert.ifError(result.error);
    assert.equal(result.data, '202799E42');
  });
  it('puede retroceder al último guardado y no al máximo histórico', async () => {
    assert.equal((await incrementar('202610I390')).data, '202610I391');
    assert.equal((await incrementar('202610I379')).data, '202610I380');
  });
  it('incrementa exclusivamente el sufijo de un prefijo libre', async () => {
    const result = await incrementar('MANUAL-999');
    assert.ifError(result.error);
    assert.equal(result.data, 'MANUAL-1000');
  });
  it('no inventa una secuencia si el último número no termina en dígitos', async () => {
    const result = await incrementar('202610I');
    assert.equal(result.error?.code, '22023');
  });
});