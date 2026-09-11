ALTER TABLE public.permisos ADD COLUMN IF NOT EXISTS orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_permisos_orden_id ON public.permisos (orden_id);