ALTER TABLE public.cotizacion_productos
  ADD COLUMN IF NOT EXISTS pais_origen text,
  ADD COLUMN IF NOT EXISTS pais_origen_codigo text;

ALTER TABLE public.orden_productos
  ADD COLUMN IF NOT EXISTS pais_origen text,
  ADD COLUMN IF NOT EXISTS pais_origen_codigo text;

ALTER TABLE public.solicitud_productos
  ADD COLUMN IF NOT EXISTS pais_origen text,
  ADD COLUMN IF NOT EXISTS pais_origen_codigo text;

ALTER TABLE public.almacen_stock
  ADD COLUMN IF NOT EXISTS pais_origen text;