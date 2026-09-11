CREATE TABLE public.expediente_contenedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  item_no integer,
  numero_contenedor text NOT NULL,
  sello1 text,
  sello2 text,
  tipo_contenedor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_contenedores TO authenticated;
GRANT ALL ON public.expediente_contenedores TO service_role;

ALTER TABLE public.expediente_contenedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expediente_contenedores staff" ON public.expediente_contenedores FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX idx_expediente_contenedores_exp ON public.expediente_contenedores(expediente_id);