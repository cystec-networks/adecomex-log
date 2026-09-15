ALTER TABLE public.solicitudes_pago_transporte
  ADD COLUMN IF NOT EXISTS cantidad_viajes numeric(10,2),
  ADD COLUMN IF NOT EXISTS precio_viaje numeric(14,2),
  ADD COLUMN IF NOT EXISTS porcentaje_margen numeric(5,2);