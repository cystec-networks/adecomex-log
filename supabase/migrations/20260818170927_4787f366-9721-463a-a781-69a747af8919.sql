CREATE TABLE public.plantillas_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'Otro',
  contenido_html text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantillas_documentos TO authenticated;
GRANT ALL ON public.plantillas_documentos TO service_role;
ALTER TABLE public.plantillas_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plantillas select" ON public.plantillas_documentos FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "plantillas write" ON public.plantillas_documentos FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role]));
CREATE TRIGGER plantillas_touch BEFORE UPDATE ON public.plantillas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.plantillas_documentos (nombre, categoria) VALUES
  ('Factura Comercial', 'Comercial'),
  ('Lista de Empaque', 'Comercial'),
  ('Certificado de Origen DR-CAFTA', 'Certificados'),
  ('Certificado de Origen (No Preferencial)', 'Certificados');

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS direccion text;