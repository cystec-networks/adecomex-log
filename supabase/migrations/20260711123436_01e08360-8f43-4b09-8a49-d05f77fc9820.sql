
-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_cambios jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    v_cambios := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := NEW.id;
    v_cambios := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_id := NEW.id;
    v_cambios := to_jsonb(NEW);
  END IF;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, auth.uid(), v_cambios);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_expedientes ON public.expedientes;
CREATE TRIGGER audit_expedientes AFTER INSERT OR UPDATE OR DELETE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

DROP TRIGGER IF EXISTS audit_solicitudes ON public.solicitudes;
CREATE TRIGGER audit_solicitudes AFTER INSERT OR UPDATE OR DELETE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

DROP TRIGGER IF EXISTS audit_permisos ON public.permisos;
CREATE TRIGGER audit_permisos AFTER INSERT OR UPDATE OR DELETE ON public.permisos
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

DROP TRIGGER IF EXISTS audit_transportes ON public.transportes;
CREATE TRIGGER audit_transportes AFTER INSERT OR UPDATE OR DELETE ON public.transportes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();
