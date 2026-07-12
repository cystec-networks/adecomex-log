
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.catalogo_paises (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_paises TO authenticated;
GRANT ALL ON public.catalogo_paises TO service_role;
ALTER TABLE public.catalogo_paises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paises_select_auth" ON public.catalogo_paises FOR SELECT TO authenticated USING (true);
CREATE POLICY "paises_admin_write" ON public.catalogo_paises FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_paises_nombre_trgm ON public.catalogo_paises USING gin (nombre gin_trgm_ops);
CREATE TRIGGER trg_paises_updated BEFORE UPDATE ON public.catalogo_paises
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.catalogo_puertos (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  cod_pais TEXT,
  pais TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_puertos TO authenticated;
GRANT ALL ON public.catalogo_puertos TO service_role;
ALTER TABLE public.catalogo_puertos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puertos_select_auth" ON public.catalogo_puertos FOR SELECT TO authenticated USING (true);
CREATE POLICY "puertos_admin_write" ON public.catalogo_puertos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_puertos_nombre_trgm ON public.catalogo_puertos USING gin (nombre gin_trgm_ops);
CREATE INDEX idx_puertos_cod_pais ON public.catalogo_puertos (cod_pais);
CREATE TRIGGER trg_puertos_updated BEFORE UPDATE ON public.catalogo_puertos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.catalogo_unidades (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  nombre_eng TEXT,
  tipo TEXT NOT NULL DEFAULT 'medida',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_unidades TO authenticated;
GRANT ALL ON public.catalogo_unidades TO service_role;
ALTER TABLE public.catalogo_unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidades_select_auth" ON public.catalogo_unidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "unidades_admin_write" ON public.catalogo_unidades FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.catalogo_unidades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS pais_origen_codigo TEXT,
  ADD COLUMN IF NOT EXISTS pais_procedencia_codigo TEXT,
  ADD COLUMN IF NOT EXISTS puerto_arribo_codigo TEXT;

ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS unidad_codigo TEXT;
