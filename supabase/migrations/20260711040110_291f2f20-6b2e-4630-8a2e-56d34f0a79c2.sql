ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS tipo_operacion text,
  ADD COLUMN IF NOT EXISTS tipo_carga text,
  ADD COLUMN IF NOT EXISTS contacto_solicitud text;