CREATE TABLE public.logistica_contenedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_logistica_id uuid NOT NULL REFERENCES public.operaciones_logistica(id) ON DELETE CASCADE,
  item_no integer,
  numero_contenedor text NOT NULL,
  sello1 text,
  sello2 text,
  tipo_contenedor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_logistica_contenedores_operacion ON public.logistica_contenedores(operacion_logistica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistica_contenedores TO authenticated;
GRANT ALL ON public.logistica_contenedores TO service_role;

ALTER TABLE public.logistica_contenedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logistica_contenedores staff" ON public.logistica_contenedores FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]));