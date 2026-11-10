-- Respaldo del correo recibido (texto y adjuntos) para poder crear la solicitud de un correo descartado.
ALTER TABLE public.correos_recibidos
  ADD COLUMN IF NOT EXISTS cuerpo text,
  ADD COLUMN IF NOT EXISTS destinatarios text,
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS adjuntos_en_gmail integer,
  ADD COLUMN IF NOT EXISTS adjuntos_respaldo jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recuperado_por uuid,
  ADD COLUMN IF NOT EXISTS recuperado_en timestamptz;

COMMENT ON COLUMN public.correos_recibidos.adjuntos_respaldo IS 'Adjuntos originales de un correo descartado (bucket documentos, correo-recibido/<id>/), conservados para crear la solicitud manualmente.';
COMMENT ON COLUMN public.correos_recibidos.adjuntos_en_gmail IS 'Adjuntos que el script vio en Gmail (incluidos los omitidos por tamaño), para detectar archivos que no llegaron.';

ALTER TABLE public.correos_recibidos DROP CONSTRAINT IF EXISTS correos_recibidos_vinculo_check;
ALTER TABLE public.correos_recibidos ADD CONSTRAINT correos_recibidos_vinculo_check
  CHECK (vinculo IS NULL OR vinculo IN ('numero','bl','vuce'));

-- Expedientes activos con ese trámite VUCE (en el Expediente o en sus permisos), ignorando guiones y mayúsculas.
CREATE OR REPLACE FUNCTION public.buscar_expedientes_por_vuce(p_vuce text)
RETURNS TABLE(id uuid, numero text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT e.id, e.numero FROM public.expedientes e
  LEFT JOIN public.permisos p ON p.expediente_id = e.id AND p.eliminado_en IS NULL
  WHERE e.eliminado_en IS NULL
    AND length(regexp_replace(upper(coalesce(p_vuce,'')), '[^A-Z0-9]', '', 'g')) >= 8
    AND (regexp_replace(upper(coalesce(e.numero_vuce,'')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_vuce), '[^A-Z0-9]', '', 'g')
      OR regexp_replace(upper(coalesce(p.numero,'')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_vuce), '[^A-Z0-9]', '', 'g'))
  LIMIT 5
$$;
REVOKE ALL ON FUNCTION public.buscar_expedientes_por_vuce(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_expedientes_por_vuce(text) TO authenticated, service_role;