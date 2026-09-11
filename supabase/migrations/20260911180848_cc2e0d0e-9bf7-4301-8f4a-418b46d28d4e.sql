ALTER TABLE public.incidencias
  ADD COLUMN IF NOT EXISTS logistica_id uuid REFERENCES public.operaciones_logistica(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_incidencias_logistica_id
  ON public.incidencias(logistica_id);