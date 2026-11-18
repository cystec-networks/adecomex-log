-- Every place that stores a file path. Any string inside the listed JSON columns counts as a reference,
-- so pending email decisions and combination histories are never treated as unused.
CREATE OR REPLACE FUNCTION private.archivos_rutas_referenciadas()
 RETURNS TABLE(bucket text, ruta text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'documentos'::text, r FROM (
    SELECT storage_path AS r FROM public.documentos
    UNION SELECT storage_path FROM public.documento_versiones
    UNION SELECT storage_path FROM public.documentos_papelera
    UNION SELECT pdf_url FROM public.facturas_ecf
    UNION SELECT documento_url FROM public.permisos
    UNION SELECT comprobante_url FROM public.gastos_operativos
    UNION SELECT adjunto_path FROM public.gastos
    UNION SELECT documento_url FROM public.cotizaciones
    UNION SELECT documento_url FROM public.logistica_documentos
    UNION SELECT storage_path FROM public.documentos_legales_empresa
    UNION SELECT storage_path FROM public.empleado_documentos
    UNION SELECT storage_path FROM public.correo_documentos_combinados
    UNION SELECT evidencia_path FROM public.etapas
    UNION SELECT archivo_path FROM public.envios_dgii
    UNION SELECT s #>> '{}' FROM public.solicitudes_correo t, jsonb_path_query(coalesce(t.adjuntos, 'null'::jsonb), 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
    UNION SELECT s #>> '{}' FROM public.correos_recibidos t, jsonb_path_query(coalesce(t.adjuntos_respaldo, 'null'::jsonb), 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
    UNION SELECT s #>> '{}' FROM public.correos_recibidos t, jsonb_path_query(coalesce(t.propuestas, 'null'::jsonb), 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
    UNION SELECT s #>> '{}' FROM public.correos_recibidos t, jsonb_path_query(coalesce(t.conflictos, 'null'::jsonb), 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
    UNION SELECT s #>> '{}' FROM public.correo_documentos_combinados t, jsonb_path_query(coalesce(t.resultado, 'null'::jsonb), 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
    UNION SELECT s #>> '{}' FROM public.documentos_papelera t, jsonb_path_query(t.versiones, 'strict $.**') s WHERE jsonb_typeof(s) = 'string'
  ) x WHERE r IS NOT NULL
  UNION SELECT 'base-normativa'::text, archivo_path FROM public.normativa_documentos WHERE archivo_path IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION private.archivos_rutas_referenciadas() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.archivos_conservados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL DEFAULT 'documentos',
  storage_path text NOT NULL,
  motivo text,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_path)
);
GRANT SELECT ON public.archivos_conservados TO authenticated;
GRANT ALL ON public.archivos_conservados TO service_role;
ALTER TABLE public.archivos_conservados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archivos conservados admin read" ON public.archivos_conservados FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.archivos_papelera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL DEFAULT 'documentos',
  storage_path text NOT NULL,
  tamano bigint,
  mime text,
  subido_en timestamptz,
  lote_id uuid NOT NULL,
  motivo text,
  eliminado_por uuid,
  eliminado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_path)
);
CREATE INDEX archivos_papelera_eliminado_idx ON public.archivos_papelera (eliminado_en DESC);
GRANT SELECT ON public.archivos_papelera TO authenticated;
GRANT ALL ON public.archivos_papelera TO service_role;
ALTER TABLE public.archivos_papelera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archivos papelera admin read" ON public.archivos_papelera FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Preview: unused files of the documentos bucket, excluding recent uploads (an upload may still be linking its row).
CREATE OR REPLACE FUNCTION public.archivos_sin_uso()
 RETURNS TABLE(storage_path text, tamano bigint, mime text, subido_en timestamptz, expediente_numero text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede revisar los archivos sin uso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH refs AS (SELECT r.ruta FROM private.archivos_rutas_referenciadas() r WHERE r.bucket = 'documentos')
  SELECT o.name, (o.metadata->>'size')::bigint, o.metadata->>'mimetype', o.created_at, e.numero
    FROM storage.objects o
    LEFT JOIN public.expedientes e ON e.id::text = split_part(o.name, '/', 1)
   WHERE o.bucket_id = 'documentos'
     AND o.created_at < now() - interval '2 days'
     AND NOT EXISTS (SELECT 1 FROM refs WHERE refs.ruta = o.name)
     AND NOT EXISTS (SELECT 1 FROM public.archivos_conservados c WHERE c.bucket = 'documentos' AND c.storage_path = o.name)
     AND NOT EXISTS (SELECT 1 FROM public.archivos_papelera p WHERE p.bucket = 'documentos' AND p.storage_path = o.name)
   ORDER BY (o.metadata->>'size')::bigint DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivos_enviar_papelera(_rutas text[], _motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lote uuid := gen_random_uuid();
  v_motivo text := nullif(btrim(coalesce(_motivo, '')), '');
  v_ok text[] := '{}';
  v_omitidos text[] := '{}';
  v_bytes bigint := 0;
  v_ruta text;
  v_obj record;
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede enviar archivos sin uso a la Papelera' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(_rutas, 1), 0) = 0 THEN RAISE EXCEPTION 'No hay archivos seleccionados'; END IF;
  IF array_length(_rutas, 1) > 1000 THEN RAISE EXCEPTION 'Máximo 1000 archivos por envío'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_refs_archivos (ruta text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE tmp_refs_archivos;
  INSERT INTO tmp_refs_archivos SELECT DISTINCT r.ruta FROM private.archivos_rutas_referenciadas() r WHERE r.bucket = 'documentos' ON CONFLICT DO NOTHING;

  FOREACH v_ruta IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(_rutas) x) LOOP
    SELECT o.name, (o.metadata->>'size')::bigint AS tamano, o.metadata->>'mimetype' AS mime, o.created_at INTO v_obj
      FROM storage.objects o WHERE o.bucket_id = 'documentos' AND o.name = v_ruta;
    IF NOT FOUND
       OR v_obj.created_at >= now() - interval '2 days'
       OR EXISTS (SELECT 1 FROM tmp_refs_archivos t WHERE t.ruta = v_ruta)
       OR EXISTS (SELECT 1 FROM public.archivos_conservados c WHERE c.bucket = 'documentos' AND c.storage_path = v_ruta)
       OR EXISTS (SELECT 1 FROM public.archivos_papelera p WHERE p.bucket = 'documentos' AND p.storage_path = v_ruta) THEN
      v_omitidos := v_omitidos || v_ruta;
      CONTINUE;
    END IF;
    INSERT INTO public.archivos_papelera (bucket, storage_path, tamano, mime, subido_en, lote_id, motivo, eliminado_por)
    VALUES ('documentos', v_ruta, v_obj.tamano, v_obj.mime, v_obj.created_at, v_lote, v_motivo, v_uid);
    v_ok := v_ok || v_ruta;
    v_bytes := v_bytes + coalesce(v_obj.tamano, 0);
  END LOOP;

  IF array_length(v_ok, 1) > 0 THEN
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('almacenamiento', NULL, 'archivos_sin_uso_enviados_papelera', v_uid, jsonb_build_object(
      'lote_id', v_lote, 'cantidad', array_length(v_ok, 1), 'bytes', v_bytes, 'motivo', v_motivo,
      'rutas', to_jsonb(v_ok), 'omitidos', to_jsonb(v_omitidos),
      'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
  END IF;
  RETURN jsonb_build_object('lote_id', v_lote, 'enviados', coalesce(array_length(v_ok, 1), 0), 'bytes', v_bytes, 'omitidos', to_jsonb(v_omitidos));
END;
$$;

CREATE OR REPLACE FUNCTION public.archivos_restaurar_papelera(_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rutas text[];
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede restaurar archivos' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.archivos_papelera WHERE id = ANY(_ids) AND eliminado_en < now() - interval '30 days') THEN
    RAISE EXCEPTION 'Pasaron más de 30 días desde que se enviaron a la Papelera: ya no se pueden restaurar';
  END IF;
  WITH d AS (DELETE FROM public.archivos_papelera WHERE id = ANY(_ids) RETURNING storage_path)
  SELECT array_agg(storage_path) INTO v_rutas FROM d;
  IF coalesce(array_length(v_rutas, 1), 0) > 0 THEN
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('almacenamiento', NULL, 'archivos_sin_uso_restaurados', v_uid, jsonb_build_object(
      'cantidad', array_length(v_rutas, 1), 'rutas', to_jsonb(v_rutas),
      'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
  END IF;
  RETURN coalesce(array_length(v_rutas, 1), 0);
END;
$$;

-- Returns the paths to remove from storage. A file that has become referenced again is only taken out of the Papelera.
CREATE OR REPLACE FUNCTION public.archivos_purgar_papelera(_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_borrar text[];
  v_en_uso text[];
  v_bytes bigint;
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede borrar archivos definitivamente' USING ERRCODE = '42501';
  END IF;
  WITH refs AS (SELECT r.ruta FROM private.archivos_rutas_referenciadas() r WHERE r.bucket = 'documentos'),
  sel AS (SELECT p.*, EXISTS (SELECT 1 FROM refs WHERE refs.ruta = p.storage_path) AS usado FROM public.archivos_papelera p WHERE p.id = ANY(_ids)),
  d AS (DELETE FROM public.archivos_papelera p USING sel WHERE p.id = sel.id RETURNING sel.storage_path, sel.usado, sel.tamano)
  SELECT array_agg(storage_path) FILTER (WHERE NOT usado), array_agg(storage_path) FILTER (WHERE usado), sum(tamano) FILTER (WHERE NOT usado)
    INTO v_borrar, v_en_uso, v_bytes FROM d;
  IF coalesce(array_length(v_borrar, 1), 0) + coalesce(array_length(v_en_uso, 1), 0) > 0 THEN
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('almacenamiento', NULL, 'archivos_sin_uso_borrados', v_uid, jsonb_build_object(
      'cantidad', coalesce(array_length(v_borrar, 1), 0), 'bytes', coalesce(v_bytes, 0),
      'rutas', to_jsonb(coalesce(v_borrar, '{}')), 'en_uso_no_borrados', to_jsonb(coalesce(v_en_uso, '{}')),
      'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
  END IF;
  RETURN jsonb_build_object('rutas', to_jsonb(coalesce(v_borrar, '{}')), 'en_uso', to_jsonb(coalesce(v_en_uso, '{}')), 'bytes', coalesce(v_bytes, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.archivo_conservar(_ruta text, _motivo text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede cambiar los archivos conservados' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.archivos_conservados (bucket, storage_path, motivo, creado_por)
  VALUES ('documentos', _ruta, nullif(btrim(coalesce(_motivo, '')), ''), v_uid)
  ON CONFLICT (bucket, storage_path) DO UPDATE SET motivo = coalesce(EXCLUDED.motivo, public.archivos_conservados.motivo)
  RETURNING id INTO v_id;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('almacenamiento', NULL, 'archivo_marcado_conservar', v_uid, jsonb_build_object('ruta', _ruta, 'motivo', _motivo,
    'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivo_quitar_conservado(_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_ruta text;
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede cambiar los archivos conservados' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.archivos_conservados WHERE id = _id RETURNING storage_path INTO v_ruta;
  IF v_ruta IS NOT NULL THEN
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('almacenamiento', NULL, 'archivo_conservar_quitado', v_uid, jsonb_build_object('ruta', v_ruta,
      'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
  END IF;
END;
$$;

-- Regenerated packages: the previous file may be removed only if it is a package PDF of the same Expediente and nothing references it.
CREATE OR REPLACE FUNCTION public.paquete_archivo_retirable(_expediente_id uuid, _ruta text)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'documentacion'::app_role, 'agente_aduanal'::app_role]) THEN
    RAISE EXCEPTION 'No tienes permiso para regenerar paquetes' USING ERRCODE = '42501';
  END IF;
  RETURN _ruta IS NOT NULL
    AND _ruta LIKE _expediente_id::text || '/%'
    AND position('/' IN substr(_ruta, length(_expediente_id::text) + 2)) = 0
    AND (_ruta ~ '/\d+_Paquete_Rectificacion_Tecnica_[^/]*\.pdf$' OR _ruta ~ '/\d+_Paquete_Envio_Factura_Cliente_[^/]*\.pdf$')
    AND NOT EXISTS (SELECT 1 FROM private.archivos_rutas_referenciadas() r WHERE r.bucket = 'documentos' AND r.ruta = _ruta);
END;
$$;

REVOKE ALL ON FUNCTION public.archivos_sin_uso() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivos_enviar_papelera(text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivos_restaurar_papelera(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivos_purgar_papelera(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivo_conservar(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivo_quitar_conservado(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.paquete_archivo_retirable(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivos_sin_uso() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivos_enviar_papelera(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivos_restaurar_papelera(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivos_purgar_papelera(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivo_conservar(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivo_quitar_conservado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paquete_archivo_retirable(uuid, text) TO authenticated;

-- Regenerated packages ('regenerado'): stamp «Actualizado» and audit, but keep no previous version.
CREATE OR REPLACE FUNCTION public.documentos_versionar_archivo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_origen text := coalesce(nullif(btrim(NEW.origen_cambio), ''), 'manual');
  v_usuario uuid;
  v_ultima public.documento_versiones%ROWTYPE;
BEGIN
  NEW.origen_cambio := NULL;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.restaurar_documento', true) = 'on' THEN
      RETURN NEW;
    END IF;
    NEW.creado_por := coalesce(auth.uid(), NEW.creado_por);
    NEW.actualizado_en := NULL;
    NEW.actualizado_por := NULL;
    NEW.actualizado_origen := NULL;
    RETURN NEW;
  END IF;

  NEW.creado_por := OLD.creado_por;
  v_usuario := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid()
                    WHEN NEW.actualizado_por IS DISTINCT FROM OLD.actualizado_por THEN NEW.actualizado_por END;

  IF OLD.storage_path IS NULL OR NEW.storage_path IS NULL OR NEW.storage_path = OLD.storage_path OR v_origen = 'sin_version' THEN
    NEW.actualizado_en := OLD.actualizado_en;
    NEW.actualizado_por := OLD.actualizado_por;
    NEW.actualizado_origen := OLD.actualizado_origen;
    RETURN NEW;
  END IF;

  IF v_origen = 'regenerado' AND OLD.tipo IN ('Paquete Rectificación Técnica', 'Paquete de Envío Factura Cliente') AND NEW.tipo = OLD.tipo THEN
    NEW.actualizado_en := now();
    NEW.actualizado_por := v_usuario;
    NEW.actualizado_origen := 'generado';
    NEW.fecha_recepcion := coalesce(OLD.fecha_recepcion, NEW.fecha_recepcion);
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('documentos', NEW.expediente_id, 'paquete_regenerado', v_usuario,
      jsonb_build_object('documento_id', NEW.id, 'tipo', NEW.tipo,
        'archivo_anterior', OLD.storage_path, 'archivo_nuevo', NEW.storage_path, 'sin_version', true));
    RETURN NEW;
  END IF;

  SELECT * INTO v_ultima FROM public.documento_versiones
   WHERE documento_id = OLD.id ORDER BY reemplazado_en DESC, created_at DESC LIMIT 1;
  IF FOUND AND v_ultima.storage_path = NEW.storage_path THEN
    DELETE FROM public.documento_versiones WHERE id = v_ultima.id;
    NEW.actualizado_en := v_ultima.actualizado_en_previo;
    NEW.actualizado_por := v_ultima.actualizado_por_previo;
    NEW.actualizado_origen := v_ultima.actualizado_origen_previo;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('documentos', NEW.expediente_id, 'documento_reemplazo_revertido', v_usuario,
      jsonb_build_object('documento_id', NEW.id, 'tipo', NEW.tipo, 'codigo_siga', NEW.codigo_siga,
        'archivo_restaurado', NEW.storage_path, 'archivo_retirado', OLD.storage_path));
    RETURN NEW;
  END IF;

  INSERT INTO public.documento_versiones (
    documento_id, expediente_id, tipo, storage_path, file_hash, codigo_siga,
    subido_en, subido_por, actualizado_en_previo, actualizado_por_previo, actualizado_origen_previo,
    reemplazado_en, reemplazado_por, origen)
  VALUES (
    OLD.id, OLD.expediente_id, OLD.tipo, OLD.storage_path, OLD.file_hash, OLD.codigo_siga,
    coalesce(OLD.actualizado_en, OLD.created_at),
    CASE WHEN OLD.actualizado_en IS NOT NULL THEN OLD.actualizado_por ELSE OLD.creado_por END,
    OLD.actualizado_en, OLD.actualizado_por, OLD.actualizado_origen,
    now(), v_usuario, v_origen);

  NEW.actualizado_en := now();
  NEW.actualizado_por := v_usuario;
  NEW.actualizado_origen := v_origen;
  NEW.fecha_recepcion := coalesce(OLD.fecha_recepcion, NEW.fecha_recepcion);

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', NEW.expediente_id, 'documento_reemplazado', v_usuario,
    jsonb_build_object('documento_id', NEW.id, 'tipo', NEW.tipo, 'codigo_siga', NEW.codigo_siga,
      'archivo_anterior', OLD.storage_path, 'archivo_nuevo', NEW.storage_path, 'origen', v_origen));
  RETURN NEW;
END;
$function$;