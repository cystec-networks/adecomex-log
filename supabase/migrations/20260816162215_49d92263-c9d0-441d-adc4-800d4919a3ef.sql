ALTER TABLE public.catalogo_tarifas_servicios
  ADD COLUMN IF NOT EXISTS gravado boolean NOT NULL DEFAULT true;

UPDATE public.catalogo_tarifas_servicios
  SET gravado = false
  WHERE servicio = 'Transporte Terrestre';