ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS pin_almacenaje TEXT,
  ADD COLUMN IF NOT EXISTS pin_almacenaje_monto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS pin_almacenaje_fecha_registro DATE,
  ADD COLUMN IF NOT EXISTS pin_almacenaje_fecha_pago DATE,
  ADD COLUMN IF NOT EXISTS pin_contenedor TEXT,
  ADD COLUMN IF NOT EXISTS pin_contenedor_monto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS pin_contenedor_fecha_registro DATE,
  ADD COLUMN IF NOT EXISTS pin_contenedor_fecha_pago DATE,
  ADD COLUMN IF NOT EXISTS valores_enviados BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valores_enviados_at TIMESTAMPTZ;