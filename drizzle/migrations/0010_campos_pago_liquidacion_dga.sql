ALTER TABLE public.expedientes
  ADD COLUMN liq_siga_pin_pago text,
  ADD COLUMN liq_siga_fecha_registro date,
  ADD COLUMN liq_siga_fecha_pago date;