ALTER TABLE public.expediente_hitos DROP CONSTRAINT IF EXISTS expediente_hitos_auto_origen_check;
ALTER TABLE public.expediente_hitos ADD CONSTRAINT expediente_hitos_auto_origen_check
  CHECK (auto_origen IS NULL OR auto_origen IN ('correo','documentos','manual','vuce_pdf','vuce_ficha','vuce_carga','correo_dga','gestor','ecf','certificado_dga','siga'));

-- Hitos de levante o despacho completo desde el Seguimiento SIGA: solo si el hito existe en el Expediente,
-- está vacío y no es manual (aplicar_hito_automatico). Personal autorizado o el proceso de correo (service_role).
CREATE OR REPLACE FUNCTION public.aplicar_hito_despacho_siga(p_expediente uuid, p_fecha timestamptz, p_detalle jsonb, p_ref uuid)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  codigo text;
  hechos text[] := '{}';
BEGIN
  IF p_expediente IS NULL OR p_fecha IS NULL THEN RETURN hechos; END IF;
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para completar hitos del Checklist';
  END IF;
  FOREACH codigo IN ARRAY ARRAY['liberado_despacho_puerto','expediente_despachado_puerto'] LOOP
    IF public.aplicar_hito_automatico(p_expediente, codigo, 'siga', p_fecha, p_detalle, p_ref, false) THEN
      hechos := hechos || codigo;
    END IF;
  END LOOP;
  RETURN hechos;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_hito_despacho_siga(uuid, timestamptz, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_hito_despacho_siga(uuid, timestamptz, jsonb, uuid) TO authenticated, service_role;

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
  actualizados int := 0;
  hitos text[] := '{}';
  x record;
  previo public.expediente_siga_procesos%ROWTYPE;
  v_fecha timestamptz; v_creacion timestamptz; v_num text; v_doc text;
  -- La bandera ya no se completa sola (SIGA la trae poco confiable).
  permitidos text[] := ARRAY['fecha_llegada_real','siga_fecha_llegada','siga_control_carga','siga_bl_madre','siga_buque','siga_viaje',
    'siga_empresa_transportista','siga_terminal','siga_administracion','peso_bruto','cantidad_bultos','area_aduanera','area_aduanera_codigo',
    'numero_igra','numero_dua'];
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
      siga_terminal = CASE WHEN coalesce(btrim(siga_terminal),'') = '' AND nullif(btrim(c->>'siga_terminal'),'') IS NOT NULL THEN btrim(c->>'siga_terminal') ELSE siga_terminal END,
      siga_administracion = CASE WHEN coalesce(btrim(siga_administracion),'') = '' AND nullif(btrim(c->>'siga_administracion'),'') IS NOT NULL THEN btrim(c->>'siga_administracion') ELSE siga_administracion END,
      peso_bruto = CASE WHEN peso_bruto IS NULL AND (c->>'peso_bruto') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'peso_bruto')::numeric ELSE peso_bruto END,
      cantidad_bultos = CASE WHEN cantidad_bultos IS NULL AND (c->>'cantidad_bultos') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'cantidad_bultos')::numeric ELSE cantidad_bultos END,
      area_aduanera = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera') ELSE area_aduanera END,
      area_aduanera_codigo = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera_codigo') ELSE area_aduanera_codigo END,
      numero_igra = CASE WHEN coalesce(btrim(numero_igra),'') = '' AND (c->>'numero_igra') ~ '^IGRA[0-9]{8,}$' THEN c->>'numero_igra' ELSE numero_igra END,
      numero_dua = CASE WHEN coalesce(btrim(numero_dua),'') = '' AND (c->>'numero_dua') ~ '^[0-9]{5}-[A-Z]{2}[0-9]{2}-[0-9]{4}-[0-9A-F]{6}$' THEN c->>'numero_dua' ELSE numero_dua END
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

    -- Procesos: fecha = «Procesado»; fecha_creacion = «Creado». Un proceso ya registrado (mismo proceso y número
    -- de solicitud; sin número, misma fecha) se actualiza con su estado y fechas nuevos en vez de duplicarse.
    FOR x IN SELECT * FROM jsonb_to_recordset(coalesce(p_procesos, '[]'::jsonb))
        AS r(proceso text, etiqueta text, numero_solicitud text, fecha text, fecha_creacion text, doc_embarque text, estado text)
    LOOP
      CONTINUE WHEN x.proceso NOT IN ('manifiesto_madre','manifiesto_consolidado','entrada','transportacion','declaracion_importacion','despacho');
      v_num := nullif(btrim(x.numero_solicitud), '');
      CONTINUE WHEN v_num IS NULL AND nullif(btrim(x.fecha), '') IS NULL;
      v_fecha := CASE WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (left(x.fecha, 16)::timestamp AT TIME ZONE 'America/Santo_Domingo')
                      WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN (x.fecha::timestamp AT TIME ZONE 'America/Santo_Domingo') END;
      v_creacion := CASE WHEN x.fecha_creacion ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (left(x.fecha_creacion, 16)::timestamp AT TIME ZONE 'America/Santo_Domingo')
                         WHEN x.fecha_creacion ~ '^\d{4}-\d{2}-\d{2}$' THEN (x.fecha_creacion::timestamp AT TIME ZONE 'America/Santo_Domingo') END;
      v_doc := nullif(btrim(x.doc_embarque), '');
      previo := NULL;
      IF v_num IS NOT NULL THEN
        SELECT * INTO previo FROM public.expediente_siga_procesos
         WHERE expediente_id = p_expediente AND proceso = x.proceso AND numero_solicitud = v_num
         ORDER BY (coalesce(fecha_texto, '') = coalesce(nullif(btrim(x.fecha), ''), '')) DESC, created_at DESC LIMIT 1;
      ELSE
        SELECT * INTO previo FROM public.expediente_siga_procesos
         WHERE expediente_id = p_expediente AND proceso = x.proceso AND numero_solicitud IS NULL AND fecha_texto = btrim(x.fecha)
         ORDER BY created_at DESC LIMIT 1;
      END IF;
      IF previo.id IS NULL THEN
        INSERT INTO public.expediente_siga_procesos (expediente_id, documento_id, proceso, etiqueta, numero_solicitud, fecha, fecha_texto, fecha_creacion, fecha_creacion_texto, doc_embarque, estado, origen)
        VALUES (p_expediente, p_documento, x.proceso, x.etiqueta, v_num, v_fecha, nullif(btrim(x.fecha), ''), v_creacion, nullif(btrim(x.fecha_creacion), ''), v_doc, nullif(btrim(x.estado), ''), p_origen)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN nuevos := nuevos + 1; END IF;
      ELSE
        UPDATE public.expediente_siga_procesos t SET
          estado = coalesce(nullif(btrim(x.estado), ''), t.estado),
          fecha = coalesce(v_fecha, t.fecha),
          fecha_texto = coalesce(nullif(btrim(x.fecha), ''), t.fecha_texto),
          fecha_creacion = coalesce(v_creacion, t.fecha_creacion),
          fecha_creacion_texto = coalesce(nullif(btrim(x.fecha_creacion), ''), t.fecha_creacion_texto),
          doc_embarque = CASE WHEN t.doc_embarque IS NULL OR (t.doc_embarque LIKE '%…%' AND v_doc IS NOT NULL AND v_doc NOT LIKE '%…%') THEN coalesce(v_doc, t.doc_embarque) ELSE t.doc_embarque END,
          documento_id = coalesce(p_documento, t.documento_id)
        WHERE t.id = previo.id
          AND (t.estado IS DISTINCT FROM coalesce(nullif(btrim(x.estado), ''), t.estado)
            OR t.fecha_texto IS DISTINCT FROM coalesce(nullif(btrim(x.fecha), ''), t.fecha_texto)
            OR t.fecha_creacion_texto IS DISTINCT FROM coalesce(nullif(btrim(x.fecha_creacion), ''), t.fecha_creacion_texto)
            OR (t.doc_embarque IS NULL AND v_doc IS NOT NULL)
            OR (t.doc_embarque LIKE '%…%' AND v_doc IS NOT NULL AND v_doc NOT LIKE '%…%'));
        IF FOUND THEN actualizados := actualizados + 1; END IF;
      END IF;
    END LOOP;

    -- Despacho completo: fecha de proceso para los hitos de levante o despacho (si existen y están vacíos).
    IF nullif(c->>'fecha_despacho_completo', '') IS NOT NULL AND (c->>'fecha_despacho_completo') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN
      hitos := public.aplicar_hito_despacho_siga(p_expediente,
        (left(c->>'fecha_despacho_completo', 16)::timestamp AT TIME ZONE 'America/Santo_Domingo'),
        jsonb_build_object('numero_despacho', coalesce(c->>'numero_despacho_referencia', n.numero_igra), 'documento_id', p_documento, 'origen', p_origen),
        p_documento);
    END IF;
  END IF;

  IF p_documento IS NOT NULL THEN
    UPDATE public.documentos
       SET lectura_siga = coalesce(p_lectura, '{}'::jsonb) || jsonb_build_object(
             'estado', p_estado, 'procesado_en', now(), 'procesado_por', auth.uid(), 'origen', p_origen,
             'completados', to_jsonb(completados), 'procesos_nuevos', nuevos, 'procesos_actualizados', actualizados, 'hitos', to_jsonb(hitos))
     WHERE id = p_documento;
  END IF;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_expediente,
    CASE WHEN p_estado = 'aplicado' THEN 'seguimiento_siga_aplicado' ELSE 'seguimiento_siga_rechazado' END,
    auth.uid(),
    jsonb_build_object('documento_id', p_documento, 'origen', p_origen, 'completados', to_jsonb(completados),
      'valores', (SELECT coalesce(jsonb_object_agg(k2, to_jsonb(n) -> k2), '{}'::jsonb) FROM unnest(completados) AS k2),
      'procesos_nuevos', nuevos, 'procesos_actualizados', actualizados, 'hitos', to_jsonb(hitos),
      'diferencias', coalesce(p_lectura -> 'diferencias', '[]'::jsonb),
      'errores', coalesce(p_lectura #> '{validacion,errores}', '[]'::jsonb)));

  RETURN jsonb_build_object('completados', to_jsonb(completados), 'procesos_nuevos', nuevos, 'procesos_actualizados', actualizados, 'hitos', to_jsonb(hitos));
END;
$$;