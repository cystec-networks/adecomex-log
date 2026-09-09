ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS cot_suplidor text,
  ADD COLUMN IF NOT EXISTS cot_suplidor_rnc text,
  ADD COLUMN IF NOT EXISTS cot_tipo_operacion text,
  ADD COLUMN IF NOT EXISTS cot_tipo_carga text,
  ADD COLUMN IF NOT EXISTS cot_contacto text;