CREATE OR REPLACE FUNCTION public.confirmacion_correo_proteger_envio()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF (OLD.estado='enviada' OR OLD.enviado_en IS NOT NULL) AND
     (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.enviado_en IS DISTINCT FROM OLD.enviado_en) THEN
    RAISE EXCEPTION 'Una confirmación enviada no puede reactivarse ni modificar su fecha de envío' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_confirmacion_correo_proteger_envio BEFORE UPDATE ON public.confirmaciones_correo FOR EACH ROW EXECUTE FUNCTION public.confirmacion_correo_proteger_envio();
CREATE OR REPLACE FUNCTION public.confirmacion_correo_auditar_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.enviado_en IS DISTINCT FROM OLD.enviado_en THEN
    INSERT INTO public.auditoria(entidad,entidad_id,accion,usuario_id,cambios)
    VALUES('confirmaciones_correo',NEW.id,'UPDATE',auth.uid(),jsonb_build_object('old',jsonb_build_object('estado',OLD.estado,'enviado_en',OLD.enviado_en),'new',jsonb_build_object('estado',NEW.estado,'enviado_en',NEW.enviado_en)));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_confirmacion_correo_auditar_estado AFTER UPDATE ON public.confirmaciones_correo FOR EACH ROW EXECUTE FUNCTION public.confirmacion_correo_auditar_estado();