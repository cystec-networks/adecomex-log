ALTER TABLE public.estudiantes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS estudiantes_deleted_at_idx ON public.estudiantes (deleted_at);