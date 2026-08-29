ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS seguro numeric(14,2),
  ADD COLUMN IF NOT EXISTS flete numeric(14,2),
  ADD COLUMN IF NOT EXISTS otros numeric(14,2),
  ADD COLUMN IF NOT EXISTS tasa_cambio_usada numeric(10,4);