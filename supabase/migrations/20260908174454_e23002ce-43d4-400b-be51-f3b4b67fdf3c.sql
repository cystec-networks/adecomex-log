ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS tipo_despacho_aduanero text,
  ADD COLUMN IF NOT EXISTS cantidad_despacho numeric;