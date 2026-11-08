CREATE TABLE public.asistente_preguntas_frecuentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta text NOT NULL CHECK (length(btrim(pregunta)) BETWEEN 3 AND 300),
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asistente_preguntas_frecuentes TO authenticated;
GRANT ALL ON public.asistente_preguntas_frecuentes TO service_role;

ALTER TABLE public.asistente_preguntas_frecuentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff lee preguntas asistente" ON public.asistente_preguntas_frecuentes
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin crea preguntas asistente" ON public.asistente_preguntas_frecuentes
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin edita preguntas asistente" ON public.asistente_preguntas_frecuentes
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin borra preguntas asistente" ON public.asistente_preguntas_frecuentes
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tocar_asistente_preguntas()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_tocar_asistente_preguntas BEFORE UPDATE ON public.asistente_preguntas_frecuentes
  FOR EACH ROW EXECUTE FUNCTION public.tocar_asistente_preguntas();

INSERT INTO public.asistente_preguntas_frecuentes (pregunta, orden) VALUES
  ('¿Qué documentos necesito para una importación?', 1),
  ('¿Cuál es la diferencia entre FCL y LCL?', 2),
  ('¿Qué es un permiso VUCE y cuándo se requiere?', 3),
  ('¿Cómo creo un Nuevo Expediente en la plataforma?', 4),
  ('¿Qué significa cada estado del Expediente?', 5),
  ('¿Cómo se calcula el valor CIF?', 6);