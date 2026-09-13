CREATE TABLE IF NOT EXISTS public.catalogo_proveedores_logisticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text,
  tax_id text,
  contacto text,
  telefono text,
  email text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_prov_log_nombre ON public.catalogo_proveedores_logisticos (lower(nombre));
GRANT SELECT ON public.catalogo_proveedores_logisticos TO authenticated;
GRANT ALL ON public.catalogo_proveedores_logisticos TO service_role;
ALTER TABLE public.catalogo_proveedores_logisticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogo_prov_log select" ON public.catalogo_proveedores_logisticos FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogo_prov_log write" ON public.catalogo_proveedores_logisticos FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]));