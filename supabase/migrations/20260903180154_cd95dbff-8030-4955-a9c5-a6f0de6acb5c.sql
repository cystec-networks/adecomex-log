ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS pais_origen text,
  ADD COLUMN IF NOT EXISTS pais_origen_codigo text;