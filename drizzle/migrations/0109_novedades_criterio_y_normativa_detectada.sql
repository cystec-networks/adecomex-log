ALTER TABLE public.novedades_comercio_exterior
  ADD COLUMN IF NOT EXISTS clasificacion_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clasificacion_criterio smallint;
COMMENT ON COLUMN public.novedades_comercio_exterior.clasificacion_manual IS 'true cuando un administrador corrigió impacto/sectores/relevancia; la IA nunca la reevalúa.';
COMMENT ON COLUMN public.novedades_comercio_exterior.clasificacion_criterio IS 'Versión del criterio de relevancia con el que la IA clasificó la fila (null = sin clasificar o criterio anterior).';

ALTER TABLE public.normativa_documentos
  ADD COLUMN IF NOT EXISTS numero_detectado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_emision_detectada boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.normativa_documentos.numero_detectado IS 'true si el número se detectó automáticamente del texto y el administrador aún no lo confirmó.';
COMMENT ON COLUMN public.normativa_documentos.fecha_emision_detectada IS 'true si la fecha de emisión se detectó automáticamente del texto y el administrador aún no la confirmó.';