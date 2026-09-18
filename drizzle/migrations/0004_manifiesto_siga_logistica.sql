-- Campos del Manifiesto de Importación SIGA en operaciones_logistica
ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS area_code text,
  ADD COLUMN IF NOT EXISTS biz_company_code text,
  ADD COLUMN IF NOT EXISTS empty_yn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loading_location_code text,
  ADD COLUMN IF NOT EXISTS unloading_location_code text,
  ADD COLUMN IF NOT EXISTS via_entrance text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS bl_type text,
  ADD COLUMN IF NOT EXISTS transit_type text,
  ADD COLUMN IF NOT EXISTS express_type text,
  ADD COLUMN IF NOT EXISTS consignor_tipo text,
  ADD COLUMN IF NOT EXISTS consignor_doc_tipo text,
  ADD COLUMN IF NOT EXISTS consignor_doc_numero text,
  ADD COLUMN IF NOT EXISTS consignor_pais text,
  ADD COLUMN IF NOT EXISTS consignor_fax text,
  ADD COLUMN IF NOT EXISTS consignor_zip text,
  ADD COLUMN IF NOT EXISTS consignor_zona text,
  ADD COLUMN IF NOT EXISTS consignor_ciudad text,
  ADD COLUMN IF NOT EXISTS consignor_calle text,
  ADD COLUMN IF NOT EXISTS consignee_tipo text,
  ADD COLUMN IF NOT EXISTS consignee_doc_tipo text,
  ADD COLUMN IF NOT EXISTS consignee_doc_numero text,
  ADD COLUMN IF NOT EXISTS consignee_pais text,
  ADD COLUMN IF NOT EXISTS consignee_fax text,
  ADD COLUMN IF NOT EXISTS consignee_zip text,
  ADD COLUMN IF NOT EXISTS consignee_zona text,
  ADD COLUMN IF NOT EXISTS consignee_ciudad text,
  ADD COLUMN IF NOT EXISTS consignee_calle text,
  ADD COLUMN IF NOT EXISTS notify_nombre text,
  ADD COLUMN IF NOT EXISTS notify_tipo text,
  ADD COLUMN IF NOT EXISTS notify_doc_tipo text,
  ADD COLUMN IF NOT EXISTS notify_doc_numero text,
  ADD COLUMN IF NOT EXISTS notify_pais text,
  ADD COLUMN IF NOT EXISTS notify_telefono text,
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS notify_fax text,
  ADD COLUMN IF NOT EXISTS notify_zip text,
  ADD COLUMN IF NOT EXISTS notify_zona text,
  ADD COLUMN IF NOT EXISTS notify_ciudad text,
  ADD COLUMN IF NOT EXISTS notify_calle text;

-- Catálogos DGA nuevos del manifiesto
CREATE TABLE IF NOT EXISTS public.catalogo_tipo_transporte_manifiesto (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_transporte_manifiesto TO authenticated;
GRANT ALL ON public.catalogo_tipo_transporte_manifiesto TO service_role;
ALTER TABLE public.catalogo_tipo_transporte_manifiesto ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctt_read ON public.catalogo_tipo_transporte_manifiesto FOR SELECT TO authenticated USING (true);
CREATE POLICY ctt_admin_write ON public.catalogo_tipo_transporte_manifiesto FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalogo_tipo_bl (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_bl TO authenticated;
GRANT ALL ON public.catalogo_tipo_bl TO service_role;
ALTER TABLE public.catalogo_tipo_bl ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbl_read ON public.catalogo_tipo_bl FOR SELECT TO authenticated USING (true);
CREATE POLICY cbl_admin_write ON public.catalogo_tipo_bl FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalogo_tipo_transito (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_transito TO authenticated;
GRANT ALL ON public.catalogo_tipo_transito TO service_role;
ALTER TABLE public.catalogo_tipo_transito ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctr_read ON public.catalogo_tipo_transito FOR SELECT TO authenticated USING (true);
CREATE POLICY ctr_admin_write ON public.catalogo_tipo_transito FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalogo_tipo_courier (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_courier TO authenticated;
GRANT ALL ON public.catalogo_tipo_courier TO service_role;
ALTER TABLE public.catalogo_tipo_courier ENABLE ROW LEVEL SECURITY;
CREATE POLICY cco_read ON public.catalogo_tipo_courier FOR SELECT TO authenticated USING (true);
CREATE POLICY cco_admin_write ON public.catalogo_tipo_courier FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalogo_tipo_consignatario (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_consignatario TO authenticated;
GRANT ALL ON public.catalogo_tipo_consignatario TO service_role;
ALTER TABLE public.catalogo_tipo_consignatario ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccg_read ON public.catalogo_tipo_consignatario FOR SELECT TO authenticated USING (true);
CREATE POLICY ccg_admin_write ON public.catalogo_tipo_consignatario FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalogo_tipo_documento_siga (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipo_documento_siga TO authenticated;
GRANT ALL ON public.catalogo_tipo_documento_siga TO service_role;
ALTER TABLE public.catalogo_tipo_documento_siga ENABLE ROW LEVEL SECURITY;
CREATE POLICY cds_read ON public.catalogo_tipo_documento_siga FOR SELECT TO authenticated USING (true);
CREATE POLICY cds_admin_write ON public.catalogo_tipo_documento_siga FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));