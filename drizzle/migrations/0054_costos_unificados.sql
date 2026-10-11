ALTER TABLE public.costos
  ADD COLUMN IF NOT EXISTS moneda public.moneda NOT NULL DEFAULT 'DOP',
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS referencia text;

INSERT INTO public.costos (expediente_id, concepto, monto_estimado, monto_real, moneda, fecha_pago, referencia)
SELECT id, 'Almacenaje', 0, pin_almacenaje_monto, 'DOP', pin_almacenaje_fecha_pago, pin_almacenaje
FROM public.expedientes WHERE coalesce(pin_almacenaje_monto,0) > 0;

INSERT INTO public.costos (expediente_id, concepto, monto_estimado, monto_real, moneda, fecha_pago, referencia)
SELECT id, 'Contenedor', 0, pin_contenedor_monto, 'DOP', pin_contenedor_fecha_pago, pin_contenedor
FROM public.expedientes WHERE coalesce(pin_contenedor_monto,0) > 0;

COMMENT ON COLUMN public.costos.monto_estimado IS 'DEPRECATED: solo se captura monto_real';
COMMENT ON COLUMN public.expedientes.pin_almacenaje_monto IS 'DEPRECATED: replaced by costos (concepto Almacenaje)';
COMMENT ON COLUMN public.expedientes.pin_contenedor_monto IS 'DEPRECATED: replaced by costos (concepto Contenedor)';
COMMENT ON COLUMN public.expedientes.pin_almacenaje_fecha_pago IS 'DEPRECATED: replaced by costos.fecha_pago';
COMMENT ON COLUMN public.expedientes.pin_contenedor_fecha_pago IS 'DEPRECATED: replaced by costos.fecha_pago';