ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS numero_certificado_origen text,
  ADD COLUMN IF NOT EXISTS rectificacion_tecnica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_tramite_rectificacion text;