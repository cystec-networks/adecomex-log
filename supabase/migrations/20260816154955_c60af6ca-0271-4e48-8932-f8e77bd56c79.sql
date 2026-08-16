ALTER TABLE public.cotizaciones_servicios
  ADD COLUMN IF NOT EXISTS expediente_id uuid REFERENCES public.expedientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cotserv_expediente ON public.cotizaciones_servicios(expediente_id);