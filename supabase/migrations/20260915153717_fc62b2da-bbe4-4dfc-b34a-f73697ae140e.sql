ALTER TABLE public.solicitudes_pago_transporte
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS destino text;