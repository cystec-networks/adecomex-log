ALTER TABLE public.expediente_siga_procesos
  ADD COLUMN IF NOT EXISTS fecha_creacion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_creacion_texto text,
  ADD COLUMN IF NOT EXISTS doc_embarque text;
COMMENT ON COLUMN public.expediente_siga_procesos.fecha IS 'Fecha y hora de proceso en SIGA («Procesado»); la que usan los hitos del Checklist.';
COMMENT ON COLUMN public.expediente_siga_procesos.fecha_texto IS 'Fecha y hora de proceso literal (YYYY-MM-DDTHH:mm, hora dominicana).';
COMMENT ON COLUMN public.expediente_siga_procesos.fecha_creacion IS 'Fecha de creación del proceso en SIGA («Creado»); null si el reporte no la trae.';

CREATE OR REPLACE FUNCTION public.aplicar_seguimiento_siga(
  p_expediente uuid, p_documento uuid, p_estado text, p_campos jsonb, p_procesos jsonb, p_lectura jsonb, p_origen text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  e public.expedientes%ROWTYPE;
  n public.expedientes%ROWTYPE;
  c jsonb := coalesce(p_campos, '{}'::jsonb);
  k text;
  completados text[] := '{}';
  auto jsonb;
  nuevos int := 0;
  permitidos text[] := ARRAY['fecha_llegada_real','siga_fecha_llegada','siga_control_carga','siga_bl_madre','siga_buque','siga_viaje',
    'siga_empresa_transportista','siga_bandera','siga_terminal','siga_administracion','peso_bruto','cantidad_bultos','area_aduanera','area_aduanera_codigo'];
BEGIN
  IF p_estado NOT IN ('aplicado','rechazado') THEN RAISE EXCEPTION 'Estado de lectura no válido: %', p_estado; END IF;
  SELECT * INTO e FROM public.expedientes WHERE id = p_expediente FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado o sin permiso'; END IF;
  IF p_documento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documentos WHERE id = p_documento AND expediente_id = p_expediente) THEN
    RAISE EXCEPTION 'El documento no pertenece al Expediente';
  END IF;

  IF p_estado = 'aplicado' THEN
    UPDATE public.expedientes SET
      fecha_llegada_real = CASE WHEN fecha_llegada_real IS NULL AND nullif(c->>'fecha_llegada_real','') IS NOT NULL THEN (c->>'fecha_llegada_real')::date ELSE fecha_llegada_real END,
      siga_fecha_llegada = CASE WHEN siga_fecha_llegada IS NULL AND nullif(c->>'siga_fecha_llegada','') IS NOT NULL THEN (c->>'siga_fecha_llegada')::timestamptz ELSE siga_fecha_llegada END,
      siga_control_carga = CASE WHEN coalesce(btrim(siga_control_carga),'') = '' AND nullif(btrim(c->>'siga_control_carga'),'') IS NOT NULL THEN btrim(c->>'siga_control_carga') ELSE siga_control_carga END,
      siga_bl_madre = CASE WHEN coalesce(btrim(siga_bl_madre),'') = '' AND nullif(btrim(c->>'siga_bl_madre'),'') IS NOT NULL THEN btrim(c->>'siga_bl_madre') ELSE siga_bl_madre END,
      siga_buque = CASE WHEN coalesce(btrim(siga_buque),'') = '' AND nullif(btrim(c->>'siga_buque'),'') IS NOT NULL THEN btrim(c->>'siga_buque') ELSE siga_buque END,
      siga_viaje = CASE WHEN coalesce(btrim(siga_viaje),'') = '' AND nullif(btrim(c->>'siga_viaje'),'') IS NOT NULL THEN btrim(c->>'siga_viaje') ELSE siga_viaje END,
      siga_empresa_transportista = CASE WHEN coalesce(btrim(siga_empresa_transportista),'') = '' AND nullif(btrim(c->>'siga_empresa_transportista'),'') IS NOT NULL THEN btrim(c->>'siga_empresa_transportista') ELSE siga_empresa_transportista END,
      siga_bandera = CASE WHEN coalesce(btrim(siga_bandera),'') = '' AND nullif(btrim(c->>'siga_bandera'),'') IS NOT NULL THEN btrim(c->>'siga_bandera') ELSE siga_bandera END,
      siga_terminal = CASE WHEN coalesce(btrim(siga_terminal),'') = '' AND nullif(btrim(c->>'siga_terminal'),'') IS NOT NULL THEN btrim(c->>'siga_terminal') ELSE siga_terminal END,
      siga_administracion = CASE WHEN coalesce(btrim(siga_administracion),'') = '' AND nullif(btrim(c->>'siga_administracion'),'') IS NOT NULL THEN btrim(c->>'siga_administracion') ELSE siga_administracion END,
      peso_bruto = CASE WHEN peso_bruto IS NULL AND (c->>'peso_bruto') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'peso_bruto')::numeric ELSE peso_bruto END,
      cantidad_bultos = CASE WHEN cantidad_bultos IS NULL AND (c->>'cantidad_bultos') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'cantidad_bultos')::numeric ELSE cantidad_bultos END,
      area_aduanera = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera') ELSE area_aduanera END,
      area_aduanera_codigo = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera_codigo') ELSE area_aduanera_codigo END
    WHERE id = p_expediente
    RETURNING * INTO n;

    auto := coalesce(e.siga_auto, '{}'::jsonb);
    FOREACH k IN ARRAY permitidos LOOP
      IF (to_jsonb(n) -> k) IS DISTINCT FROM (to_jsonb(e) -> k) THEN
        completados := completados || k;
        auto := auto || jsonb_build_object(k, jsonb_build_object('valor', to_jsonb(n) -> k, 'documento_id', p_documento, 'fecha', now(), 'origen', p_origen));
      END IF;
    END LOOP;
    IF array_length(completados, 1) > 0 THEN
      UPDATE public.expedientes SET siga_auto = auto WHERE id = p_expediente;
    END IF;

    -- fecha = «Procesado» (fecha y hora de proceso); fecha_creacion = «Creado» si SIGA la trae.
    -- Un proceso ya registrado solo recibe la creación o el documento de embarque que le faltaban.
    WITH ins AS (
      INSERT INTO public.expediente_siga_procesos AS t (expediente_id, documento_id, proceso, etiqueta, numero_solicitud, fecha, fecha_texto, fecha_creacion, fecha_creacion_texto, doc_embarque, estado, origen)
      SELECT p_expediente, p_documento, x.proceso, x.etiqueta, nullif(btrim(x.numero_solicitud), ''),
        CASE WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (left(x.fecha, 16)::timestamp AT TIME ZONE 'America/Santo_Domingo')
             WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN (x.fecha::timestamp AT TIME ZONE 'America/Santo_Domingo') END,
        nullif(btrim(x.fecha), ''),
        CASE WHEN x.fecha_creacion ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (left(x.fecha_creacion, 16)::timestamp AT TIME ZONE 'America/Santo_Domingo')
             WHEN x.fecha_creacion ~ '^\d{4}-\d{2}-\d{2}$' THEN (x.fecha_creacion::timestamp AT TIME ZONE 'America/Santo_Domingo') END,
        nullif(btrim(x.fecha_creacion), ''), nullif(btrim(x.doc_embarque), ''),
        nullif(btrim(x.estado), ''), p_origen
      FROM jsonb_to_recordset(coalesce(p_procesos, '[]'::jsonb)) AS x(proceso text, etiqueta text, numero_solicitud text, fecha text, fecha_creacion text, doc_embarque text, estado text)
      WHERE x.proceso IN ('manifiesto_madre','manifiesto_consolidado','entrada','transportacion')
        AND (nullif(btrim(x.numero_solicitud), '') IS NOT NULL OR nullif(btrim(x.fecha), '') IS NOT NULL)
      ON CONFLICT (expediente_id, proceso, (coalesce(numero_solicitud, '')), (coalesce(fecha_texto, ''))) DO UPDATE SET
        fecha_creacion = coalesce(t.fecha_creacion, excluded.fecha_creacion),
        fecha_creacion_texto = coalesce(t.fecha_creacion_texto, excluded.fecha_creacion_texto),
        doc_embarque = coalesce(t.doc_embarque, excluded.doc_embarque)
      WHERE (t.fecha_creacion_texto IS NULL AND excluded.fecha_creacion_texto IS NOT NULL)
         OR (t.doc_embarque IS NULL AND excluded.doc_embarque IS NOT NULL)
      RETURNING (xmax = 0) AS insertado
    ) SELECT count(*) FILTER (WHERE insertado) INTO nuevos FROM ins;
  END IF;

  IF p_documento IS NOT NULL THEN
    UPDATE public.documentos
       SET lectura_siga = coalesce(p_lectura, '{}'::jsonb) || jsonb_build_object(
             'estado', p_estado, 'procesado_en', now(), 'procesado_por', auth.uid(), 'origen', p_origen,
             'completados', to_jsonb(completados))
     WHERE id = p_documento;
  END IF;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_expediente,
    CASE WHEN p_estado = 'aplicado' THEN 'seguimiento_siga_aplicado' ELSE 'seguimiento_siga_rechazado' END,
    auth.uid(),
    jsonb_build_object('documento_id', p_documento, 'origen', p_origen, 'completados', to_jsonb(completados),
      'valores', (SELECT coalesce(jsonb_object_agg(k2, to_jsonb(n) -> k2), '{}'::jsonb) FROM unnest(completados) AS k2),
      'procesos_nuevos', nuevos,
      'diferencias', coalesce(p_lectura -> 'diferencias', '[]'::jsonb),
      'errores', coalesce(p_lectura #> '{validacion,errores}', '[]'::jsonb)));

  RETURN jsonb_build_object('completados', to_jsonb(completados), 'procesos_nuevos', nuevos);
END;
$$;