ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS acuerdo_comercial text;
ALTER TABLE public.mercancia_items ADD COLUMN IF NOT EXISTS estado_producto_codigo text;
ALTER TABLE public.cotizacion_productos ADD COLUMN IF NOT EXISTS estado_producto_codigo text;
ALTER TABLE public.orden_productos ADD COLUMN IF NOT EXISTS estado_producto_codigo text;
ALTER TABLE public.solicitud_productos ADD COLUMN IF NOT EXISTS estado_producto_codigo text;