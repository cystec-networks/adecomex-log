
DO $$ BEGIN
  CREATE TYPE public.documento_legal_tipo AS ENUM (
    'registro_mercantil','rnc_dgii','fianza_aduanal','licencia_agente_aduanas',
    'acta_asamblea','certificado_digital_siga','registro_nombre_comercial_onapi',
    'poliza_seguro','otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.documentos_legales_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.documento_legal_tipo NOT NULL,
  numero_referencia text,
  entidad_emisora text,
  fecha_emision date,
  fecha_vencimiento date,
  storage_path text,
  responsable text,
  notas text,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_legales_empresa TO authenticated;
GRANT ALL ON public.documentos_legales_empresa TO service_role;

ALTER TABLE public.documentos_legales_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin select docs legales" ON public.documentos_legales_empresa
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));
CREATE POLICY "admin insert docs legales" ON public.documentos_legales_empresa
  FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));
CREATE POLICY "admin update docs legales" ON public.documentos_legales_empresa
  FOR UPDATE TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));
CREATE POLICY "admin delete docs legales" ON public.documentos_legales_empresa
  FOR DELETE TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER touch_docs_legales BEFORE UPDATE ON public.documentos_legales_empresa
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_docs_legales AFTER INSERT OR UPDATE OR DELETE ON public.documentos_legales_empresa
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE INDEX idx_docs_legales_vencimiento ON public.documentos_legales_empresa(fecha_vencimiento) WHERE deleted_at IS NULL;
CREATE INDEX idx_docs_legales_tipo ON public.documentos_legales_empresa(tipo) WHERE deleted_at IS NULL;
