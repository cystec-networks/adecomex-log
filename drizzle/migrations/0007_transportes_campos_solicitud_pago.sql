ALTER TABLE public.transportes
  ADD COLUMN IF NOT EXISTS transportista_rnc TEXT,
  ADD COLUMN IF NOT EXISTS transportista_telefono TEXT,
  ADD COLUMN IF NOT EXISTS cantidad_viajes INTEGER,
  ADD COLUMN IF NOT EXISTS precio_viaje NUMERIC,
  ADD COLUMN IF NOT EXISTS porcentaje_margen NUMERIC;