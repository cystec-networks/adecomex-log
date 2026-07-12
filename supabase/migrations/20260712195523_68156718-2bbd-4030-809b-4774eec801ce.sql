
ALTER TABLE public.transportes
  ADD COLUMN IF NOT EXISTS costo_viaje numeric,
  ADD COLUMN IF NOT EXISTS descuento_cxc numeric,
  ADD COLUMN IF NOT EXISTS pago_referencia text,
  ADD COLUMN IF NOT EXISTS factura_costo_numero text,
  ADD COLUMN IF NOT EXISTS factura_costo_fecha date,
  ADD COLUMN IF NOT EXISTS contenedores_cantidad integer,
  ADD COLUMN IF NOT EXISTS contenedores_detalle text;
