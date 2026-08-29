CREATE TABLE public.calculos_pre_liquidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_importador text,
  tasa_cambio numeric,
  datos_entrada jsonb NOT NULL,
  resultado jsonb NOT NULL,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculos_pre_liquidacion TO authenticated;
GRANT ALL ON public.calculos_pre_liquidacion TO service_role;
ALTER TABLE public.calculos_pre_liquidacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calculos staff all" ON public.calculos_pre_liquidacion FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));