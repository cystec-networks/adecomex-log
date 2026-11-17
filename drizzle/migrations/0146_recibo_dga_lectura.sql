ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS liq_recibo_numero text,
  ADD COLUMN IF NOT EXISTS liq_recibo_banco text,
  ADD COLUMN IF NOT EXISTS liq_recibo_transaccion text;

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS lectura_recibo jsonb;

COMMENT ON COLUMN public.documentos.lectura_recibo IS 'Lectura determinista del comprobante de pago DGA: campos leídos, comparación con la Liquidación y diferencia aceptada';