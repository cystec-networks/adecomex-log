CREATE TABLE public.dga_paises (
  codigo text PRIMARY KEY,
  pais text NOT NULL
);
GRANT SELECT ON public.dga_paises TO authenticated;
GRANT ALL ON public.dga_paises TO service_role;
ALTER TABLE public.dga_paises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dga_paises_select" ON public.dga_paises FOR SELECT TO authenticated USING (true);
CREATE POLICY "dga_paises_admin" ON public.dga_paises FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.dga_puertos (
  codigo text PRIMARY KEY,
  puerto text NOT NULL,
  codigo_pais text,
  pais text
);
CREATE INDEX idx_dga_puertos_puerto ON public.dga_puertos USING gin (puerto gin_trgm_ops);
CREATE INDEX idx_dga_puertos_codigo_pais ON public.dga_puertos (codigo_pais);
GRANT SELECT ON public.dga_puertos TO authenticated;
GRANT ALL ON public.dga_puertos TO service_role;
ALTER TABLE public.dga_puertos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dga_puertos_select" ON public.dga_puertos FOR SELECT TO authenticated USING (true);
CREATE POLICY "dga_puertos_admin" ON public.dga_puertos FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.dga_areas (
  codigo text PRIMARY KEY,
  area text NOT NULL,
  localizacion text
);
GRANT SELECT ON public.dga_areas TO authenticated;
GRANT ALL ON public.dga_areas TO service_role;
ALTER TABLE public.dga_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dga_areas_select" ON public.dga_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "dga_areas_admin" ON public.dga_areas FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

ALTER TABLE public.solicitudes
  ADD COLUMN IF NOT EXISTS origen_codigo text,
  ADD COLUMN IF NOT EXISTS puerto_llegada_codigo text;