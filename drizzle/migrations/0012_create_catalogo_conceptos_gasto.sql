CREATE TABLE public.catalogo_conceptos_gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'confirmado',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_conceptos_gasto TO authenticated;
GRANT ALL ON public.catalogo_conceptos_gasto TO service_role;

ALTER TABLE public.catalogo_conceptos_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cg_read" ON public.catalogo_conceptos_gasto
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cg_admin_write" ON public.catalogo_conceptos_gasto
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
