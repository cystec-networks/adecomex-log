CREATE TABLE public.banco_config (
  cuenta text PRIMARY KEY,
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  fecha_saldo_inicial date NOT NULL,
  actualizado_por uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banco_config TO authenticated;
GRANT ALL ON public.banco_config TO service_role;

ALTER TABLE public.banco_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banco_config staff" ON public.banco_config FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role,'contabilidad'::app_role]));

CREATE TRIGGER banco_config_touch BEFORE UPDATE ON public.banco_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();