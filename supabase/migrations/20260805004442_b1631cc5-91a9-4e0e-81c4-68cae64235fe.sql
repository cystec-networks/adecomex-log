ALTER TABLE public.transportes
  ADD COLUMN IF NOT EXISTS solicitud_pago_id uuid REFERENCES public.solicitudes_pago_transporte(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transportes_solicitud_pago_id ON public.transportes(solicitud_pago_id);

UPDATE public.transportes t
SET solicitud_pago_id = s.id
FROM public.solicitudes_pago_transporte s
WHERE s.transporte_id = t.id
  AND t.solicitud_pago_id IS NULL;