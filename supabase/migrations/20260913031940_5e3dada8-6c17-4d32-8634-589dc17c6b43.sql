ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS voyage text,
  ADD COLUMN IF NOT EXISTS lugar_recepcion text,
  ADD COLUMN IF NOT EXISTS puerto_descarga text,
  ADD COLUMN IF NOT EXISTS cantidad_bultos integer,
  ADD COLUMN IF NOT EXISTS tipo_bultos text,
  ADD COLUMN IF NOT EXISTS terminos_flete text;