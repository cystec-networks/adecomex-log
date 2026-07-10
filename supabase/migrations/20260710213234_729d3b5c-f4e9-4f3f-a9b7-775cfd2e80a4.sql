
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS eliminado_por UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expedientes_activos_idx
  ON public.expedientes (created_at DESC)
  WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS expedientes_papelera_idx
  ON public.expedientes (eliminado_en DESC)
  WHERE eliminado_en IS NOT NULL;
