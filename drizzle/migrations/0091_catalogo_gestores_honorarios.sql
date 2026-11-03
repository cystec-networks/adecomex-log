CREATE TABLE public.catalogo_gestores_honorarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_gestores_honorarios TO authenticated;
GRANT ALL ON public.catalogo_gestores_honorarios TO service_role;
ALTER TABLE public.catalogo_gestores_honorarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gh_read" ON public.catalogo_gestores_honorarios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gh_admin_write" ON public.catalogo_gestores_honorarios
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));