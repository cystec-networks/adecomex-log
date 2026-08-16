CREATE TABLE public.banco_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta text NOT NULL DEFAULT '747315737',
  fecha date NOT NULL,
  referencia text,
  monto numeric(14,2) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('credito','debito')),
  descripcion text,
  codigo_transaccion text,
  numero_cheque text,
  hash_linea text NOT NULL,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_tipo text,
  conciliado_id uuid,
  conciliado_por uuid REFERENCES auth.users(id),
  conciliado_en timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_banco_mov_hash ON public.banco_movimientos(hash_linea);
CREATE INDEX idx_banco_mov_fecha ON public.banco_movimientos(fecha);
CREATE INDEX idx_banco_mov_conciliado ON public.banco_movimientos(conciliado);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banco_movimientos TO authenticated;
GRANT ALL ON public.banco_movimientos TO service_role;

ALTER TABLE public.banco_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banco_movimientos staff" ON public.banco_movimientos FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role,'contabilidad'::app_role]));