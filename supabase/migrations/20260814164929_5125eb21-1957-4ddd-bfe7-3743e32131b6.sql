ALTER TABLE public.ordenes ADD COLUMN IF NOT EXISTS solicitud_id uuid REFERENCES public.solicitudes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ordenes_solicitud ON public.ordenes(solicitud_id);
UPDATE public.ordenes o SET solicitud_id = s.id FROM public.solicitudes s WHERE s.orden_id = o.id;
DROP INDEX IF EXISTS public.idx_solicitudes_orden;
ALTER TABLE public.solicitudes DROP COLUMN IF EXISTS orden_id;