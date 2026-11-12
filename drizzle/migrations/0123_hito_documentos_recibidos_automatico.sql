-- Fecha real del correo (Gmail) enviada por el script; antes solo se guardaba la hora de recepción en la plataforma.
ALTER TABLE public.correos_recibidos ADD COLUMN IF NOT EXISTS fecha_correo timestamptz;

-- Origen de la fecha automática del hito «Documentos digitales recibidos».
ALTER TABLE public.expediente_hitos
  ADD COLUMN IF NOT EXISTS auto_origen text,
  ADD COLUMN IF NOT EXISTS auto_fecha timestamptz,
  ADD COLUMN IF NOT EXISTS auto_correo_id uuid,
  ADD COLUMN IF NOT EXISTS auto_solicitud_id uuid;
ALTER TABLE public.expediente_hitos DROP CONSTRAINT IF EXISTS expediente_hitos_auto_origen_check;
ALTER TABLE public.expediente_hitos ADD CONSTRAINT expediente_hitos_auto_origen_check
  CHECK (auto_origen IS NULL OR auto_origen IN ('correo', 'documentos', 'manual'));
COMMENT ON COLUMN public.expediente_hitos.auto_origen IS 'correo/documentos = fecha puesta automáticamente; manual = editada a mano (nunca se vuelve a llenar sola); NULL = nunca tocada.';

-- Fecha y registro del correo original de una solicitud: el más antiguo entre el Registro y la propia solicitud.
CREATE OR REPLACE FUNCTION public.correo_original_solicitud(p_solicitud uuid)
RETURNS TABLE(fecha timestamptz, correo_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH registro AS (
    SELECT cr.id, COALESCE(cr.fecha_correo, cr.primer_intento_at, cr.created_at) AS f
    FROM public.correos_recibidos cr WHERE cr.solicitud_id = p_solicitud
    ORDER BY 2 ASC LIMIT 1
  )
  SELECT LEAST((SELECT f FROM registro), (SELECT sc.created_at FROM public.solicitudes_correo sc WHERE sc.id = p_solicitud)),
         (SELECT id FROM registro);
$$;
REVOKE ALL ON FUNCTION public.correo_original_solicitud(uuid) FROM PUBLIC, anon, authenticated;

-- Completa el hito 1 con la llegada del correo. Solo si está vacío o lo llenó la primera carga de documentos
-- (que en la confirmación ocurre segundos antes); nunca pisa una fecha manual ni otro correo.
CREATE OR REPLACE FUNCTION public.completar_hito_documentos_correo(p_expediente uuid, p_solicitud uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_fecha timestamptz; v_correo uuid; v_n integer;
BEGIN
  SELECT fecha, correo_id INTO v_fecha, v_correo FROM public.correo_original_solicitud(p_solicitud);
  IF v_fecha IS NULL THEN RETURN false; END IF;
  UPDATE public.expediente_hitos
     SET fecha_cumplimiento = (v_fecha AT TIME ZONE 'America/Santo_Domingo')::date,
         estado = 'completado', auto_origen = 'correo', auto_fecha = v_fecha,
         auto_correo_id = v_correo, auto_solicitud_id = p_solicitud
   WHERE expediente_id = p_expediente AND hito_codigo = 'documentos_recibidos'
     AND ((auto_origen IS NULL AND fecha_cumplimiento IS NULL) OR auto_origen = 'documentos');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.completar_hito_documentos_correo(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hito_documentos_por_solicitud()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.completar_hito_documentos_correo(NEW.expediente_id, NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hito_documentos_por_solicitud ON public.solicitudes_correo;
CREATE TRIGGER hito_documentos_por_solicitud
  AFTER INSERT OR UPDATE OF expediente_id ON public.solicitudes_correo
  FOR EACH ROW
  WHEN (NEW.expediente_id IS NOT NULL)
  EXECUTE FUNCTION public.hito_documentos_por_solicitud();

-- Expediente sin correo: la primera carga de un archivo fija la fecha (solo si es el primer documento con archivo).
CREATE OR REPLACE FUNCTION public.hito_documentos_por_carga()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.storage_path IS NOT NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.documentos d WHERE d.expediente_id = NEW.expediente_id AND d.storage_path IS NOT NULL AND d.id <> NEW.id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.expediente_hitos
     SET fecha_cumplimiento = (now() AT TIME ZONE 'America/Santo_Domingo')::date,
         estado = 'completado', auto_origen = 'documentos', auto_fecha = now(),
         auto_correo_id = NULL, auto_solicitud_id = NULL
   WHERE expediente_id = NEW.expediente_id AND hito_codigo = 'documentos_recibidos'
     AND auto_origen IS NULL AND fecha_cumplimiento IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hito_documentos_por_carga ON public.documentos;
CREATE TRIGGER hito_documentos_por_carga
  AFTER INSERT OR UPDATE OF storage_path ON public.documentos
  FOR EACH ROW
  WHEN (NEW.storage_path IS NOT NULL AND NEW.expediente_id IS NOT NULL)
  EXECUTE FUNCTION public.hito_documentos_por_carga();

-- Vista previa (solo staff) de los Expedientes creados desde correo con el hito 1 vacío, sin modificar nada.
CREATE OR REPLACE FUNCTION public.hitos_documentos_correo_pendientes()
RETURNS TABLE(expediente_id uuid, numero text, solicitud_id uuid, fecha_correo timestamptz, correo_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ON (e.id) e.id, e.numero, sc.id, o.fecha, o.correo_id
  FROM public.solicitudes_correo sc
  JOIN public.expedientes e ON e.id = sc.expediente_id
  JOIN public.expediente_hitos h ON h.expediente_id = e.id AND h.hito_codigo = 'documentos_recibidos'
  CROSS JOIN LATERAL public.correo_original_solicitud(sc.id) o
  WHERE private.is_staff(auth.uid()) AND h.fecha_cumplimiento IS NULL AND h.auto_origen IS NULL
  ORDER BY e.id, o.fecha ASC;
$$;
REVOKE ALL ON FUNCTION public.hitos_documentos_correo_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitos_documentos_correo_pendientes() TO authenticated;