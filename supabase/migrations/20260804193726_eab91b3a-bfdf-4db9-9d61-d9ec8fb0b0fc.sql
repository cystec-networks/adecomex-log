ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS afp_monto_fijo numeric(14,2),
  ADD COLUMN IF NOT EXISTS ars_monto_fijo numeric(14,2);