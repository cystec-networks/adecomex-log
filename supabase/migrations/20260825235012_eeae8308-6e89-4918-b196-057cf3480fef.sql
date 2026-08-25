CREATE TABLE public.catalogo_terceros_extranjeros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tid text NOT NULL,
  direccion text,
  telefono text,
  fax text,
  email text,
  pais_codigo text,
  pais_nombre text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_terceros_extranjeros TO authenticated;
GRANT ALL ON public.catalogo_terceros_extranjeros TO service_role;

ALTER TABLE public.catalogo_terceros_extranjeros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terceros_extranjeros select" ON public.catalogo_terceros_extranjeros FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "terceros_extranjeros write" ON public.catalogo_terceros_extranjeros FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX idx_terceros_extranjeros_nombre ON public.catalogo_terceros_extranjeros (nombre);