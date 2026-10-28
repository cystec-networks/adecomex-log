CREATE UNIQUE INDEX IF NOT EXISTS confirmaciones_correo_pendiente_unica ON public.confirmaciones_correo(expediente_id) WHERE estado='pendiente';
CREATE OR REPLACE FUNCTION public.confirmacion_correo_reutilizar_pendiente()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $f$
BEGIN
  IF NEW.estado='pendiente' AND NEW.expediente_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('confirmacion:'||NEW.expediente_id::text,0));
    UPDATE public.confirmaciones_correo SET para=NEW.para, cc=NEW.cc, asunto=NEW.asunto, cuerpo=NEW.cuerpo,
      id_hilo=coalesce(NEW.id_hilo,id_hilo), solicitud_correo_id=coalesce(NEW.solicitud_correo_id,solicitud_correo_id), created_at=now()
    WHERE expediente_id=NEW.expediente_id AND estado='pendiente';
    IF FOUND THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS trg_confirmacion_correo_pendiente_unica ON public.confirmaciones_correo;
CREATE TRIGGER trg_confirmacion_correo_pendiente_unica BEFORE INSERT ON public.confirmaciones_correo
FOR EACH ROW EXECUTE FUNCTION public.confirmacion_correo_reutilizar_pendiente();