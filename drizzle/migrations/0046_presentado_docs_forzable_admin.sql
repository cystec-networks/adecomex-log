DO $$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.validar_transicion_expediente'::regproc);
  src := replace(src, $a$        IF es_priv THEN
          INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
          VALUES ('expedientes', NEW.id, 'presentado_forzado_documentos:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
                  jsonb_build_object('faltan', falta_docs, 'motivo', NEW.motivo_regreso_estado));
        ELSE
          RAISE EXCEPTION 'No se puede marcar como Presentado: falta adjuntar %.', falta_docs;
        END IF;$a$, $b$        forzables := forzables || ('Falta adjuntar ' || falta_docs || ' para Presentado');$b$);
  IF position('presentado_forzado_documentos' in src) > 0 THEN RAISE EXCEPTION 'reemplazo no aplicado'; END IF;
  EXECUTE src;
END $$;