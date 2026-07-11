ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS total_fob numeric(14,2),
  ADD COLUMN IF NOT EXISTS seguro numeric(14,2),
  ADD COLUMN IF NOT EXISTS flete numeric(14,2),
  ADD COLUMN IF NOT EXISTS otros numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_cif numeric(14,2),
  ADD COLUMN IF NOT EXISTS regimen_aduanero text;