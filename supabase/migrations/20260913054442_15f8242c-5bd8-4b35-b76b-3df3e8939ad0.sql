ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS tipo_operacion text DEFAULT 'Importación',
  ADD COLUMN IF NOT EXISTS comprador_nombre text,
  ADD COLUMN IF NOT EXISTS comprador_tax_id text,
  ADD COLUMN IF NOT EXISTS comprador_direccion text,
  ADD COLUMN IF NOT EXISTS comprador_telefono text,
  ADD COLUMN IF NOT EXISTS comprador_email text;