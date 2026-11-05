import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual deployed SQL in isolated PostgreSQL, never production fixtures.
const migration = (name: string) => readFileSync(`drizzle/migrations/${name}.sql`, 'utf8');
const functionSql = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = sql.indexOf('END $$;', start);
  if (start < 0 || end < 0) throw new Error(`Missing migration function ${name}`);
  return sql.slice(start, end + 'END $$;'.length);
};

describe('Numeración automática: primer disponible y bloqueo manual', () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.expedientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text UNIQUE, orden_id uuid);
      CREATE TABLE public.ordenes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text, cotizacion_id uuid);
      CREATE TABLE public.cotizaciones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text);
      CREATE TABLE public.numeracion_expedientes_referencia(singleton boolean PRIMARY KEY, numero text);
    `);
    const original = migration('0101_expedientes_ultimo_numero_guardado');
    const increment = original.slice(original.indexOf('CREATE FUNCTION public.incrementar_numero_expediente'), original.indexOf('REVOKE ALL ON FUNCTION public.incrementar_numero_expediente'));
    await db.exec(increment);
    await db.exec(migration('0103_expedientes_automatico_primer_numero_libre'));
    await db.exec(functionSql(original, 'asignar_numero_expediente'));
    await db.exec(functionSql(migration('0086_numeracion_unificada_compras'), 'validar_numero_operacion_unico'));
    await db.exec(`
      CREATE TRIGGER trg_asignar BEFORE INSERT ON public.expedientes FOR EACH ROW EXECUTE FUNCTION public.asignar_numero_expediente();
      CREATE TRIGGER zz_validar BEFORE INSERT OR UPDATE OF numero ON public.expedientes FOR EACH ROW EXECUTE FUNCTION public.validar_numero_operacion_unico();
    `);
  });
  beforeEach(async () => {
    await db.exec('TRUNCATE public.expedientes, public.ordenes, public.cotizaciones, public.numeracion_expedientes_referencia;');
    await db.exec("INSERT INTO public.numeracion_expedientes_referencia VALUES(true,'202610I386');");
  });
  afterAll(async () => { await db.close(); });
  const create = async (numero: string | null = null) => {
    const result = await db.query<{ numero: string }>('INSERT INTO public.expedientes(numero) VALUES($1) RETURNING numero', [numero]);
    return result.rows[0]?.numero;
  };

  it('salta 387, 388 y 389 ocupados y guarda directamente 390', async () => {
    await db.exec("INSERT INTO public.expedientes(numero) VALUES('202610I387'),('202610I388'),('202610I389');");
    expect(await create()).toBe('202610I390');
  });
  it('usa el primer hueco y no el máximo histórico', async () => {
    await db.exec("INSERT INTO public.expedientes(numero) VALUES('202610I387'),('202610I390');");
    expect(await create()).toBe('202610I388');
  });
  it('bloquea 387 escrito manualmente en lugar de sustituirlo', async () => {
    await create('202610I387');
    await expect(create('202610I387')).rejects.toMatchObject({ code: '23505' });
    const { rows } = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.expedientes WHERE numero='202610I387'");
    expect(rows[0]?.count).toBe(1);
  });
  it('salta también números reservados por compras ajenas', async () => {
    await db.exec("INSERT INTO public.cotizaciones(numero) VALUES('202610I387'); INSERT INTO public.ordenes(numero) VALUES('202610I388');");
    expect(await create()).toBe('202610I389');
  });
  it('conserva el prefijo del último guardado sin recalcular fecha o tipo', async () => {
    await db.exec("UPDATE public.numeracion_expedientes_referencia SET numero='202799E41'; INSERT INTO public.expedientes(numero) VALUES('202799E42');");
    expect(await create()).toBe('202799E43');
  });
  it('conserva el número heredado al convertir una Orden', async () => {
    const order = await db.query<{ id: string }>("INSERT INTO public.ordenes(numero) VALUES('202610I387') RETURNING id");
    const result = await db.query<{ numero: string }>('INSERT INTO public.expedientes(orden_id) VALUES($1) RETURNING numero', [order.rows[0]?.id]);
    expect(result.rows[0]?.numero).toBe('202610I387');
  });
});