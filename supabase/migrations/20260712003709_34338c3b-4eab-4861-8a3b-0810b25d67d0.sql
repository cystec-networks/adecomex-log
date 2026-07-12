
-- Reusable timestamp helper (idempotent)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ CATÁLOGOS COMPLETOS ============

-- Áreas / Administración aduanera
CREATE TABLE IF NOT EXISTS public.catalogo_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_areas TO authenticated, anon;
GRANT ALL ON public.catalogo_areas TO service_role;
ALTER TABLE public.catalogo_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas_read_all" ON public.catalogo_areas FOR SELECT USING (true);
CREATE POLICY "areas_admin_write" ON public.catalogo_areas FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_areas_updated BEFORE UPDATE ON public.catalogo_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tipos documento identidad
CREATE TABLE IF NOT EXISTS public.catalogo_tipos_documento_id (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_tipos_documento_id TO authenticated, anon;
GRANT ALL ON public.catalogo_tipos_documento_id TO service_role;
ALTER TABLE public.catalogo_tipos_documento_id ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tdi_read" ON public.catalogo_tipos_documento_id FOR SELECT USING (true);
CREATE POLICY "tdi_admin_write" ON public.catalogo_tipos_documento_id FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_tdi_updated BEFORE UPDATE ON public.catalogo_tipos_documento_id
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalogo_tipos_documento_id (codigo, nombre) VALUES
  ('1','Cédula'),('2','RNC'),('3','Pasaporte'),('4','Otro')
ON CONFLICT (codigo) DO NOTHING;

-- Métodos de transporte
CREATE TABLE IF NOT EXISTS public.catalogo_metodos_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  nombre_eng text,
  estado text NOT NULL DEFAULT 'pendiente_validar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_metodos_transporte TO authenticated, anon;
GRANT ALL ON public.catalogo_metodos_transporte TO service_role;
ALTER TABLE public.catalogo_metodos_transporte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_read" ON public.catalogo_metodos_transporte FOR SELECT USING (true);
CREATE POLICY "mt_admin_write" ON public.catalogo_metodos_transporte FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_mt_updated BEFORE UPDATE ON public.catalogo_metodos_transporte
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalogo_metodos_transporte (codigo, nombre, nombre_eng, estado) VALUES
  ('1','Marítimo','Maritime','pendiente_validar'),
  ('2','Aéreo','Air','pendiente_validar'),
  ('3','Terrestre','Land','pendiente_validar')
ON CONFLICT (codigo) DO NOTHING;

-- ============ CATÁLOGOS PENDIENTES ============
-- Estructura común: codigo, nombre, estado ('confirmado'|'pendiente')

CREATE TABLE IF NOT EXISTS public.catalogo_regimenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_regimenes TO authenticated, anon;
GRANT ALL ON public.catalogo_regimenes TO service_role;
ALTER TABLE public.catalogo_regimenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reg_read" ON public.catalogo_regimenes FOR SELECT USING (true);
CREATE POLICY "reg_admin_write" ON public.catalogo_regimenes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_reg_updated BEFORE UPDATE ON public.catalogo_regimenes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.catalogo_regimenes (codigo, nombre, estado) VALUES
  ('1','Despacho a Consumo','confirmado')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.catalogo_acuerdos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_acuerdos TO authenticated, anon;
GRANT ALL ON public.catalogo_acuerdos TO service_role;
ALTER TABLE public.catalogo_acuerdos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acu_read" ON public.catalogo_acuerdos FOR SELECT USING (true);
CREATE POLICY "acu_admin_write" ON public.catalogo_acuerdos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_acu_updated BEFORE UPDATE ON public.catalogo_acuerdos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.catalogo_acuerdos (codigo, nombre, estado) VALUES
  ('1','DR-CAFTA','confirmado'),
  ('3','EPA','pendiente')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.catalogo_tipos_despacho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_tipos_despacho TO authenticated, anon;
GRANT ALL ON public.catalogo_tipos_despacho TO service_role;
ALTER TABLE public.catalogo_tipos_despacho ENABLE ROW LEVEL SECURITY;
CREATE POLICY "td_read" ON public.catalogo_tipos_despacho FOR SELECT USING (true);
CREATE POLICY "td_admin_write" ON public.catalogo_tipos_despacho FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_td_updated BEFORE UPDATE ON public.catalogo_tipos_despacho
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.catalogo_estados_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_estados_producto TO authenticated, anon;
GRANT ALL ON public.catalogo_estados_producto TO service_role;
ALTER TABLE public.catalogo_estados_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ep_read" ON public.catalogo_estados_producto FOR SELECT USING (true);
CREATE POLICY "ep_admin_write" ON public.catalogo_estados_producto FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ep_updated BEFORE UPDATE ON public.catalogo_estados_producto
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.catalogo_documentos_requeridos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_documentos_requeridos TO authenticated, anon;
GRANT ALL ON public.catalogo_documentos_requeridos TO service_role;
ALTER TABLE public.catalogo_documentos_requeridos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr_read" ON public.catalogo_documentos_requeridos FOR SELECT USING (true);
CREATE POLICY "dr_admin_write" ON public.catalogo_documentos_requeridos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dr_updated BEFORE UPDATE ON public.catalogo_documentos_requeridos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Marca "sin código DGA" en expedientes ============
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS sin_codigo_dga boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS area_aduanera_codigo text,
  ADD COLUMN IF NOT EXISTS regimen_codigo text,
  ADD COLUMN IF NOT EXISTS acuerdo_codigo text,
  ADD COLUMN IF NOT EXISTS tipo_despacho_codigo text,
  ADD COLUMN IF NOT EXISTS metodo_transporte_codigo text;
