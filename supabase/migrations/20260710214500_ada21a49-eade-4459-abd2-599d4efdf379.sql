ALTER TABLE public.solicitudes
  ADD COLUMN IF NOT EXISTS eliminado_en timestamptz,
  ADD COLUMN IF NOT EXISTS eliminado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS solicitudes_activos_idx ON public.solicitudes (created_at DESC) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS solicitudes_papelera_idx ON public.solicitudes (eliminado_en DESC) WHERE eliminado_en IS NOT NULL;