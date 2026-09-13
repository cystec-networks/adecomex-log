ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS hazmat_recargo numeric(14,2);