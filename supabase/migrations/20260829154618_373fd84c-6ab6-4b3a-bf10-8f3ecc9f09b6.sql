CREATE TABLE public.recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  fecha_recepcion date NOT NULL DEFAULT CURRENT_DATE,
  recibido_por uuid REFERENCES auth.users(id),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recepciones TO authenticated;
GRANT ALL ON public.recepciones TO service_role;

ALTER TABLE public.recepciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recepciones staff all" ON public.recepciones FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.recepcion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id uuid NOT NULL REFERENCES public.recepciones(id) ON DELETE CASCADE,
  mercancia_item_id uuid NOT NULL REFERENCES public.mercancia_items(id) ON DELETE CASCADE,
  cantidad_esperada numeric NOT NULL,
  cantidad_recibida numeric NOT NULL,
  peso_esperado numeric,
  peso_recibido numeric,
  calidad text NOT NULL DEFAULT 'conforme',
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recepcion_lineas TO authenticated;
GRANT ALL ON public.recepcion_lineas TO service_role;

ALTER TABLE public.recepcion_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recepcion_lineas staff all" ON public.recepcion_lineas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));