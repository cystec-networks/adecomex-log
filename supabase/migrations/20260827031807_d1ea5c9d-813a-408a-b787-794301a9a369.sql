ALTER TABLE public.dga_productos_historico
  ADD COLUMN IF NOT EXISTS pct_gravamen numeric,
  ADD COLUMN IF NOT EXISTS aplica_isc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pct_isc numeric,
  ADD COLUMN IF NOT EXISTS pct_itbis numeric DEFAULT 18;