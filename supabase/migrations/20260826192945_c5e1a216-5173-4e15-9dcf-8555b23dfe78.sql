CREATE TABLE public.documentos_generados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  plantilla_id uuid REFERENCES public.plantillas_documentos(id) ON DELETE SET NULL,
  html_resuelto text NOT NULL,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX documentos_generados_exp_plantilla_uq
  ON public.documentos_generados (expediente_id, plantilla_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_generados TO authenticated;
GRANT ALL ON public.documentos_generados TO service_role;

ALTER TABLE public.documentos_generados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_generados staff" ON public.documentos_generados FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER documentos_generados_touch
  BEFORE UPDATE ON public.documentos_generados
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();