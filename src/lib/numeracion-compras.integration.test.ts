import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Opt-in live contract test: uses an authorized session and removes only its own rows.
describe('Numeración de compras — contrato real', { skip: !process.env.NUMERACION_TEST_TOKEN }, () => {
  it('comparte contador I/E, conserva número en conversiones y respeta históricos', async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = process.env.NUMERACION_TEST_TOKEN;
    assert.ok(url && key && token, 'Falta sesión autorizada para la prueba real');
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const quotes: string[] = [];
    let orderId: string | undefined;
    let expedienteId: string | undefined;
    const historical = await db.from('cotizaciones').select('id,numero').like('numero', 'COT-%').limit(1).single();
    assert.ifError(historical.error);
    try {
      const q = await db.from('cotizaciones').insert({ tipo_operacion: 'Importación', notas: 'PRUEBA NUMERACIÓN AUTOMATIZADA — retirar' }).select('id,numero').single();
      assert.ifError(q.error);
      assert.ok(q.data);
      quotes.push(q.data.id);
      assert.match(q.data.numero, /^202610I\d+$/);
      const expQuote = await db.from('cotizaciones').insert({ tipo_operacion: 'Exportación', notas: 'PRUEBA NUMERACIÓN AUTOMATIZADA — retirar' }).select('id,numero').single();
      assert.ifError(expQuote.error);
      assert.ok(expQuote.data);
      quotes.push(expQuote.data.id);
      assert.match(expQuote.data.numero, /^202610E\d+$/);
      assert.ok(Number(expQuote.data.numero.slice(7)) > Number(q.data.numero.slice(7)));
      const order = await db.from('ordenes').insert({ cotizacion_id: q.data.id, cot_tipo_operacion: 'Importación' }).select('id,numero').single();
      assert.ifError(order.error);
      assert.ok(order.data);
      orderId = order.data.id;
      assert.equal(order.data.numero, q.data.numero);
      const exp = await db.from('expedientes').insert({ orden_id: orderId, tipo_operacion: 'Importación' }).select('id,numero').single();
      assert.ifError(exp.error);
      assert.ok(exp.data);
      expedienteId = exp.data.id;
      assert.equal(exp.data.numero, q.data.numero);
      const collision = await db.from('expedientes').insert({ numero: q.data.numero, tipo_operacion: 'Importación' });
      assert.equal(collision.error?.code, '23505');
      const changed = await db.from('ordenes').update({ numero: '202610I999999' }).eq('id', orderId);
      assert.equal(changed.error?.code, '23514');
      const readback = await db.from('cotizaciones').select('numero').eq('id', historical.data.id).single();
      assert.ifError(readback.error);
      assert.equal(readback.data?.numero, historical.data.numero);
    } finally {
      if (expedienteId) assert.ifError((await db.from('expedientes').delete().eq('id', expedienteId)).error);
      if (orderId) assert.ifError((await db.from('ordenes').delete().eq('id', orderId)).error);
      if (quotes.length) assert.ifError((await db.from('cotizaciones').delete().in('id', quotes)).error);
    }
  });
});