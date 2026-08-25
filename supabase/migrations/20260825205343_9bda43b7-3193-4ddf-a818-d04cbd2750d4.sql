CREATE TABLE public.catalogo_uso_certificado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.catalogo_tipo_emisor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.catalogo_tratamientos_certificado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.catalogo_criterio_origen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.catalogo_metodo_calificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_uso_certificado TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_emisor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tratamientos_certificado TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_criterio_origen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_metodo_calificacion TO authenticated;
GRANT ALL ON public.catalogo_uso_certificado TO service_role;
GRANT ALL ON public.catalogo_tipo_emisor TO service_role;
GRANT ALL ON public.catalogo_tratamientos_certificado TO service_role;
GRANT ALL ON public.catalogo_criterio_origen TO service_role;
GRANT ALL ON public.catalogo_metodo_calificacion TO service_role;

ALTER TABLE public.catalogo_uso_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_tipo_emisor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_tratamientos_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_criterio_origen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_metodo_calificacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uso_cert_read" ON public.catalogo_uso_certificado FOR SELECT TO authenticated USING (true);
CREATE POLICY "uso_cert_admin_write" ON public.catalogo_uso_certificado FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "tipo_emisor_read" ON public.catalogo_tipo_emisor FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipo_emisor_admin_write" ON public.catalogo_tipo_emisor FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "trat_cert_read" ON public.catalogo_tratamientos_certificado FOR SELECT TO authenticated USING (true);
CREATE POLICY "trat_cert_admin_write" ON public.catalogo_tratamientos_certificado FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "crit_origen_read" ON public.catalogo_criterio_origen FOR SELECT TO authenticated USING (true);
CREATE POLICY "crit_origen_admin_write" ON public.catalogo_criterio_origen FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "met_calif_read" ON public.catalogo_metodo_calificacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "met_calif_admin_write" ON public.catalogo_metodo_calificacion FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.catalogo_uso_certificado (codigo, nombre, estado) VALUES ('IC50-002','Uso general','confirmado');
INSERT INTO public.catalogo_tipo_emisor (codigo, nombre, estado) VALUES ('IC51-001','Emisor autorizado','confirmado');
INSERT INTO public.catalogo_tratamientos_certificado (codigo, nombre, estado) VALUES ('1','DR-CAFTA','confirmado');
INSERT INTO public.catalogo_criterio_origen (codigo, nombre, estado) VALUES ('IC12-001','Criterio 1','pendiente');
INSERT INTO public.catalogo_metodo_calificacion (codigo, nombre, estado) VALUES ('IC13-001','Método 1','pendiente');

ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS criterio_origen_codigo text,
  ADD COLUMN IF NOT EXISTS metodo_calificacion_codigo text;

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS certificado_periodo_desde date,
  ADD COLUMN IF NOT EXISTS certificado_periodo_hasta date,
  ADD COLUMN IF NOT EXISTS certificado_uso_codigo text,
  ADD COLUMN IF NOT EXISTS certificado_emisor_codigo text,
  ADD COLUMN IF NOT EXISTS certificado_tratamiento_codigo text,
  ADD COLUMN IF NOT EXISTS certificado_transporte_desc text,
  ADD COLUMN IF NOT EXISTS certificado_remark text,
  ADD COLUMN IF NOT EXISTS certificado_productor_rnc text;