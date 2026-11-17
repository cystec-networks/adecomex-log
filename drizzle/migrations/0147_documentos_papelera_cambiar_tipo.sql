CREATE TABLE public.documentos_papelera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL UNIQUE,
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  codigo_siga text,
  storage_path text,
  documento jsonb NOT NULL,
  versiones jsonb NOT NULL DEFAULT '[]'::jsonb,
  vinculos jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  eliminado_por uuid,
  eliminado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documentos_papelera_expediente_idx ON public.documentos_papelera (expediente_id, eliminado_en DESC);

GRANT SELECT ON public.documentos_papelera TO authenticated;
GRANT ALL ON public.documentos_papelera TO service_role;
ALTER TABLE public.documentos_papelera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos papelera read" ON public.documentos_papelera FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'documentacion'::app_role, 'agente_aduanal'::app_role]));

-- Restaurar desde la Papelera conserva los sellos «Actualizado» originales del documento.
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

CREATE OR REPLACE FUNCTION public.documento_nombre_archivo(_path text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT regexp_replace(regexp_replace(coalesce(_path, ''), '^.*/', ''), '^(\d{10,}_|[0-9a-fA-F-]{36}-)', '') $$;

CREATE OR REPLACE FUNCTION public.documento_enviar_papelera(_documento_id uuid, _motivo text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.documentos%ROWTYPE;
  v_id uuid;
  v_vers jsonb;
  v_vinc jsonb;
  v_num text;
  v_motivo text := nullif(btrim(coalesce(_motivo, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT private.has_any_role(v_uid, ARRAY['admin'::app_role, 'operaciones'::app_role, 'documentacion'::app_role, 'agente_aduanal'::app_role]) THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar documentos' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_doc FROM public.documentos WHERE id = _documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no existe; recarga la página'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.reemplazado_en), '[]'::jsonb) INTO v_vers
    FROM public.documento_versiones v WHERE v.documento_id = _documento_id;
  v_vinc := jsonb_build_object(
    'endosos', (SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM public.expediente_endosos WHERE documento_id = _documento_id),
    'procesos_siga', (SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM public.expediente_siga_procesos WHERE documento_id = _documento_id));
  SELECT numero INTO v_num FROM public.expedientes WHERE id = v_doc.expediente_id;

  INSERT INTO public.documentos_papelera (documento_id, expediente_id, tipo, codigo_siga, storage_path, documento, versiones, vinculos, motivo, eliminado_por)
  VALUES (v_doc.id, v_doc.expediente_id, v_doc.tipo, v_doc.codigo_siga, v_doc.storage_path, to_jsonb(v_doc), v_vers, v_vinc, v_motivo, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', v_doc.expediente_id, 'documento_enviado_papelera', v_uid, jsonb_build_object(
    'documento_id', v_doc.id, 'papelera_id', v_id, 'expediente', v_num, 'tipo', v_doc.tipo, 'codigo_siga', v_doc.codigo_siga,
    'archivo', public.documento_nombre_archivo(v_doc.storage_path), 'storage_path', v_doc.storage_path,
    'versiones', jsonb_array_length(v_vers), 'motivo', v_motivo,
    'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));

  DELETE FROM public.documentos WHERE id = _documento_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.documento_restaurar_papelera(_papelera_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.documentos_papelera%ROWTYPE;
  v_num text;
BEGIN
  IF v_uid IS NULL OR NOT private.has_any_role(v_uid, ARRAY['admin'::app_role, 'operaciones'::app_role, 'documentacion'::app_role, 'agente_aduanal'::app_role]) THEN
    RAISE EXCEPTION 'No tienes permiso para restaurar documentos' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.documentos_papelera WHERE id = _papelera_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no está en la Papelera; recarga la página'; END IF;
  IF v_p.eliminado_en < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Pasaron más de 30 días desde que se eliminó: ya no se puede restaurar. Solo el Administrador puede borrarlo definitivamente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = v_p.documento_id) THEN
    RAISE EXCEPTION 'El documento ya existe en el Expediente';
  END IF;
  SELECT numero INTO v_num FROM public.expedientes WHERE id = v_p.expediente_id;
  IF v_num IS NULL THEN RAISE EXCEPTION 'El Expediente del documento ya no existe'; END IF;

  PERFORM set_config('app.restaurar_documento', 'on', true);
  INSERT INTO public.documentos SELECT * FROM jsonb_populate_record(NULL::public.documentos, v_p.documento);
  PERFORM set_config('app.restaurar_documento', 'off', true);
  INSERT INTO public.documento_versiones SELECT * FROM jsonb_populate_recordset(NULL::public.documento_versiones, v_p.versiones);

  UPDATE public.expediente_endosos SET documento_id = v_p.documento_id
   WHERE documento_id IS NULL AND id IN (SELECT (jsonb_array_elements_text(coalesce(v_p.vinculos->'endosos', '[]'::jsonb)))::uuid);
  UPDATE public.expediente_siga_procesos SET documento_id = v_p.documento_id
   WHERE documento_id IS NULL AND id IN (SELECT (jsonb_array_elements_text(coalesce(v_p.vinculos->'procesos_siga', '[]'::jsonb)))::uuid);

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', v_p.expediente_id, 'documento_restaurado', v_uid, jsonb_build_object(
    'documento_id', v_p.documento_id, 'expediente', v_num, 'tipo', v_p.tipo, 'codigo_siga', v_p.codigo_siga,
    'archivo', public.documento_nombre_archivo(v_p.storage_path), 'eliminado_en', v_p.eliminado_en,
    'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));

  DELETE FROM public.documentos_papelera WHERE id = _papelera_id;
  RETURN v_p.documento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.documento_purgar_papelera(_papelera_id uuid)
 RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.documentos_papelera%ROWTYPE;
  v_rutas text[];
  v_num text;
BEGIN
  IF v_uid IS NULL OR NOT private.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede borrar documentos definitivamente' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.documentos_papelera WHERE id = _papelera_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no está en la Papelera; recarga la página'; END IF;

  -- Solo archivos que ningún otro documento, versión o elemento de la Papelera sigue usando.
  SELECT coalesce(array_agg(DISTINCT r), '{}') INTO v_rutas FROM (
    SELECT v_p.storage_path AS r
    UNION SELECT x->>'storage_path' FROM jsonb_array_elements(v_p.versiones) x
  ) t
  WHERE r IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.storage_path = t.r)
    AND NOT EXISTS (SELECT 1 FROM public.documento_versiones v WHERE v.storage_path = t.r)
    AND NOT EXISTS (SELECT 1 FROM public.documentos_papelera o WHERE o.id <> v_p.id
      AND (o.storage_path = t.r OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.versiones) y WHERE y->>'storage_path' = t.r)));

  SELECT numero INTO v_num FROM public.expedientes WHERE id = v_p.expediente_id;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', v_p.expediente_id, 'documento_borrado_definitivo', v_uid, jsonb_build_object(
    'documento_id', v_p.documento_id, 'expediente', v_num, 'tipo', v_p.tipo, 'codigo_siga', v_p.codigo_siga,
    'archivo', public.documento_nombre_archivo(v_p.storage_path), 'archivos_borrados', to_jsonb(v_rutas),
    'eliminado_en', v_p.eliminado_en, 'motivo_eliminacion', v_p.motivo,
    'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));

  DELETE FROM public.documentos_papelera WHERE id = _papelera_id;
  RETURN v_rutas;
END;
$$;

CREATE OR REPLACE FUNCTION public.documento_cambiar_tipo(_documento_id uuid, _tipo text, _codigo_siga text DEFAULT NULL, _motivo text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.documentos%ROWTYPE;
  v_tipo text := nullif(btrim(coalesce(_tipo, '')), '');
  v_codigo text := nullif(btrim(coalesce(_codigo_siga, '')), '');
  v_num text;
BEGIN
  IF v_uid IS NULL OR NOT private.has_any_role(v_uid, ARRAY['admin'::app_role, 'operaciones'::app_role, 'documentacion'::app_role, 'agente_aduanal'::app_role]) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el tipo de documentos' USING ERRCODE = '42501';
  END IF;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'Elige el nuevo tipo de documento'; END IF;
  SELECT * INTO v_doc FROM public.documentos WHERE id = _documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no existe; recarga la página'; END IF;
  IF v_doc.tipo = v_tipo THEN RAISE EXCEPTION 'El documento ya es de ese tipo'; END IF;
  IF v_codigo IS NOT NULL AND EXISTS (SELECT 1 FROM public.documentos WHERE expediente_id = v_doc.expediente_id AND codigo_siga = v_codigo AND id <> v_doc.id) THEN
    RAISE EXCEPTION 'El código % ya está en uso en este Expediente', v_codigo;
  END IF;
  SELECT numero INTO v_num FROM public.expedientes WHERE id = v_doc.expediente_id;

  -- Mismo archivo: sin versión nueva ni sello «Actualizado»; las lecturas del tipo anterior se descartan.
  UPDATE public.documentos SET tipo = v_tipo, codigo_siga = coalesce(v_codigo, codigo_siga),
    lectura_siga = NULL, lectura_dua = NULL, lectura_recibo = NULL, origen_cambio = 'sin_version'
   WHERE id = _documento_id;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', v_doc.expediente_id, 'documento_tipo_cambiado', v_uid, jsonb_build_object(
    'documento_id', v_doc.id, 'expediente', v_num, 'tipo_anterior', v_doc.tipo, 'tipo', v_tipo,
    'codigo_anterior', v_doc.codigo_siga, 'codigo_siga', coalesce(v_codigo, v_doc.codigo_siga),
    'archivo', public.documento_nombre_archivo(v_doc.storage_path), 'motivo', nullif(btrim(coalesce(_motivo, '')), ''),
    'usuario', (SELECT nombre FROM public.profiles WHERE id = v_uid)));
END;
$$;

REVOKE ALL ON FUNCTION public.documento_enviar_papelera(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.documento_restaurar_papelera(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.documento_purgar_papelera(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.documento_cambiar_tipo(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documento_enviar_papelera(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documento_restaurar_papelera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documento_purgar_papelera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documento_cambiar_tipo(uuid, text, text, text) TO authenticated;