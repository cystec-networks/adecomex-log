DO $$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.validar_transicion_expediente'::regproc);
  src := replace(src, $a$motivo text; forzables text[] := ARRAY[]::text[];$a$, $b$motivo text; forzables text[] := ARRAY[]::text[]; forzables_ops text[] := ARRAY[]::text[];$b$);
  src := replace(src, $a$forzables := forzables || ('Falta adjuntar ' || falta_docs || ' para Presentado');$a$, $b$forzables_ops := forzables_ops || ('Falta adjuntar ' || falta_docs || ' para Presentado');$b$);
  src := replace(src, $a$  IF array_length(forzables, 1) > 0 THEN$a$, $b$  IF array_length(forzables_ops, 1) > 0 AND COALESCE(array_length(forzables, 1), 0) = 0 THEN
    IF es_priv AND motivo IS NOT NULL THEN
      INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
      VALUES ('expedientes', NEW.id, 'cambio_estado_forzado:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
              jsonb_build_object('faltan', to_jsonb(forzables_ops), 'justificacion', motivo));
    ELSE
      RAISE EXCEPTION 'No se puede cambiar el estado: %. Solo Administración u Operaciones pueden forzarlo con justificación.', array_to_string(forzables_ops, '; ');
    END IF;
  END IF;
  forzables := forzables || forzables_ops;
  IF COALESCE(array_length(forzables, 1), 0) > COALESCE(array_length(forzables_ops, 1), 0) THEN$b$);
  IF position('forzables_ops := forzables_ops' in src) = 0 OR position('forzables := forzables || forzables_ops' in src) = 0 THEN RAISE EXCEPTION 'reemplazo no aplicado'; END IF;
  EXECUTE src;
END $$;