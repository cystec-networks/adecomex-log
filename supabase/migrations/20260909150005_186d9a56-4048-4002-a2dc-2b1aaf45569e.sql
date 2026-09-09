ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS suplidor text,
  ADD COLUMN IF NOT EXISTS suplidor_rnc text,
  ADD COLUMN IF NOT EXISTS tipo_operacion text DEFAULT 'Importación',
  ADD COLUMN IF NOT EXISTS tipo_carga text,
  ADD COLUMN IF NOT EXISTS contacto text;