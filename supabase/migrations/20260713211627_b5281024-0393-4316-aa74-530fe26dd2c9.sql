
CREATE TABLE public.catalogo_tasas_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL UNIQUE,
  tasa numeric(10,4) NOT NULL CHECK (tasa > 0),
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tasas_cambio TO authenticated;
GRANT ALL ON public.catalogo_tasas_cambio TO service_role;

ALTER TABLE public.catalogo_tasas_cambio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasas_cambio_select_auth" ON public.catalogo_tasas_cambio
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasas_cambio_insert_auth" ON public.catalogo_tasas_cambio
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tasas_cambio_update_admin" ON public.catalogo_tasas_cambio
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "tasas_cambio_delete_admin" ON public.catalogo_tasas_cambio
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_tasas_cambio_updated_at
  BEFORE UPDATE ON public.catalogo_tasas_cambio
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS tasa_cambio_usada numeric(10,4),
  ADD COLUMN IF NOT EXISTS tasa_cambio_congelada boolean NOT NULL DEFAULT false;
