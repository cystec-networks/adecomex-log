CREATE OR REPLACE FUNCTION public.aplicar_autocompletado_operativo(p_expediente uuid, p_documento uuid, p_estado text, p_campos jsonb, p_lectura jsonb, p_origen text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.expedientes%ROWTYPE;
  n public.expedientes%ROWTYPE;
  c jsonb := coalesce(p_campos, '{}'::jsonb);
  k text;
  completados text[] := '{}';
  auto jsonb;
  contenedores int := 0;
  permitidos text[] := ARRAY[
    'bl_awb','naviera','puerto_salida','puerto_salida_codigo','puerto_arribo','puerto_arribo_codigo',
    'fecha_cargado','medio_transporte','peso_bruto','peso_neto','cantidad_bultos','tipo_carga',
    'pais_procedencia','pais_procedencia_codigo','suplidor','factura_comercial','total_fob','seguro',
    'flete','otros','incoterm','pais_origen','pais_origen_codigo','descripcion_mercancia'
  ];
BEGIN
  IF p_estado NOT IN ('aplicado','rechazado') THEN RAISE EXCEPTION 'Estado de lectura no válido: %', p_estado; END IF;
  SELECT * INTO e FROM public.expedientes WHERE id = p_expediente FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado o sin permiso'; END IF;
  IF p_documento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documentos WHERE id = p_documento AND expediente_id = p_expediente) THEN
    RAISE EXCEPTION 'El documento no pertenece al Expediente';
  END IF;

  IF p_estado = 'aplicado' THEN
    UPDATE public.expedientes SET
      bl_awb = CASE WHEN coalesce(btrim(bl_awb),'') = '' AND nullif(btrim(c->>'bl_awb'),'') IS NOT NULL THEN btrim(c->>'bl_awb') ELSE bl_awb END,
      naviera = CASE WHEN coalesce(btrim(naviera),'') = '' AND nullif(btrim(c->>'naviera'),'') IS NOT NULL THEN btrim(c->>'naviera') ELSE naviera END,
      puerto_salida = CASE WHEN coalesce(btrim(puerto_salida),'') = '' AND nullif(btrim(c->>'puerto_salida'),'') IS NOT NULL THEN btrim(c->>'puerto_salida') ELSE puerto_salida END,
      puerto_salida_codigo = CASE WHEN coalesce(btrim(puerto_salida),'') = '' AND coalesce(btrim(puerto_salida_codigo),'') = ''
          AND nullif(btrim(c->>'puerto_salida_codigo'),'') IS NOT NULL THEN btrim(c->>'puerto_salida_codigo') ELSE puerto_salida_codigo END,
      puerto_arribo = CASE WHEN coalesce(btrim(puerto_arribo),'') = '' AND nullif(btrim(c->>'puerto_arribo'),'') IS NOT NULL THEN btrim(c->>'puerto_arribo') ELSE puerto_arribo END,
      puerto_arribo_codigo = CASE WHEN coalesce(btrim(puerto_arribo),'') = '' AND coalesce(btrim(puerto_arribo_codigo),'') = ''
          AND nullif(btrim(c->>'puerto_arribo_codigo'),'') IS NOT NULL THEN btrim(c->>'puerto_arribo_codigo') ELSE puerto_arribo_codigo END,
      fecha_cargado = CASE WHEN fecha_cargado IS NULL AND (c->>'fecha_cargado') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (c->>'fecha_cargado')::date ELSE fecha_cargado END,
      medio_transporte = CASE WHEN coalesce(btrim(medio_transporte),'') = '' AND nullif(btrim(c->>'medio_transporte'),'') IS NOT NULL THEN btrim(c->>'medio_transporte') ELSE medio_transporte END,
      peso_bruto = CASE WHEN coalesce(peso_bruto,0) = 0 AND (c->>'peso_bruto') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'peso_bruto')::numeric ELSE peso_bruto END,
      peso_neto = CASE WHEN coalesce(peso_neto,0) = 0 AND (c->>'peso_neto') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'peso_neto')::numeric ELSE peso_neto END,
      cantidad_bultos = CASE WHEN coalesce(cantidad_bultos,0) = 0 AND (c->>'cantidad_bultos') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'cantidad_bultos')::numeric ELSE cantidad_bultos END,
      tipo_carga = CASE WHEN coalesce(btrim(tipo_carga),'') = '' AND nullif(btrim(c->>'tipo_carga'),'') IS NOT NULL THEN btrim(c->>'tipo_carga') ELSE tipo_carga END,
      pais_procedencia = CASE WHEN coalesce(btrim(pais_procedencia),'') = '' AND nullif(btrim(c->>'pais_procedencia'),'') IS NOT NULL THEN btrim(c->>'pais_procedencia') ELSE pais_procedencia END,
      pais_procedencia_codigo = CASE WHEN coalesce(btrim(pais_procedencia),'') = '' AND coalesce(btrim(pais_procedencia_codigo),'') = ''
          AND nullif(btrim(c->>'pais_procedencia_codigo'),'') IS NOT NULL THEN btrim(c->>'pais_procedencia_codigo') ELSE pais_procedencia_codigo END,
      suplidor = CASE WHEN coalesce(btrim(suplidor),'') = '' AND nullif(btrim(c->>'suplidor'),'') IS NOT NULL THEN btrim(c->>'suplidor') ELSE suplidor END,
      factura_comercial = CASE WHEN coalesce(btrim(factura_comercial),'') = '' AND nullif(btrim(c->>'factura_comercial'),'') IS NOT NULL THEN btrim(c->>'factura_comercial') ELSE factura_comercial END,
      total_fob = CASE WHEN coalesce(total_fob,0) = 0 AND (c->>'total_fob') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'total_fob')::numeric ELSE total_fob END,
      seguro = CASE WHEN coalesce(seguro,0) = 0 AND (c->>'seguro') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'seguro')::numeric ELSE seguro END,
      flete = CASE WHEN coalesce(flete,0) = 0 AND (c->>'flete') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'flete')::numeric ELSE flete END,
      otros = CASE WHEN coalesce(otros,0) = 0 AND (c->>'otros') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'otros')::numeric ELSE otros END,
      incoterm = CASE WHEN coalesce(btrim(incoterm),'') = '' AND nullif(btrim(c->>'incoterm'),'') IS NOT NULL THEN btrim(c->>'incoterm') ELSE incoterm END,
      pais_origen = CASE WHEN coalesce(btrim(pais_origen),'') = '' AND nullif(btrim(c->>'pais_origen'),'') IS NOT NULL THEN btrim(c->>'pais_origen') ELSE pais_origen END,
      pais_origen_codigo = CASE WHEN coalesce(btrim(pais_origen),'') = '' AND coalesce(btrim(pais_origen_codigo),'') = ''
          AND nullif(btrim(c->>'pais_origen_codigo'),'') IS NOT NULL THEN btrim(c->>'pais_origen_codigo') ELSE pais_origen_codigo END,
      descripcion_mercancia = CASE WHEN coalesce(btrim(descripcion_mercancia),'') = '' AND nullif(btrim(c->>'descripcion_mercancia'),'') IS NOT NULL THEN btrim(c->>'descripcion_mercancia') ELSE descripcion_mercancia END
    WHERE id = p_expediente
    RETURNING * INTO n;

    auto := coalesce(e.auto_documento, '{}'::jsonb);
    FOREACH k IN ARRAY permitidos LOOP
      IF (to_jsonb(n) -> k) IS DISTINCT FROM (to_jsonb(e) -> k) THEN
        completados := completados || k;
        auto := auto || jsonb_build_object(k, jsonb_build_object(
          'valor', to_jsonb(n) -> k, 'documento_id', p_documento,
          'fuente', coalesce(p_lectura->>'fuente',''), 'fecha', now(), 'origen', p_origen));
      END IF;
    END LOOP;
    IF array_length(completados, 1) > 0 THEN
      UPDATE public.expedientes SET auto_documento = auto WHERE id = p_expediente;
    END IF;
    -- Total CIF = FOB + seguro + flete + otros, igual que al guardar la ficha; se recalcula si se completó alguno.
    IF completados && ARRAY['total_fob','seguro','flete','otros'] THEN
      UPDATE public.expedientes
         SET total_cif = coalesce(n.total_fob,0) + coalesce(n.seguro,0) + coalesce(n.flete,0) + coalesce(n.otros,0)
       WHERE id = p_expediente;
    END IF;

    -- Contenedores: jsonb_array_elements WITH ORDINALITY + ->> (jsonb_to_recordset no admite ORDINALITY con lista de columnas).
    IF c ? 'contenedores' AND NOT EXISTS (SELECT 1 FROM public.expediente_contenedores WHERE expediente_id = p_expediente) THEN
      WITH ins AS (
        INSERT INTO public.expediente_contenedores (expediente_id, item_no, numero_contenedor, sello1, sello2, tipo_contenedor)
        SELECT p_expediente, x.o::int, nullif(btrim(x.v->>'numero'), ''), nullif(btrim(x.v->>'sello1'), ''),
          nullif(btrim(x.v->>'sello2'), ''), nullif(btrim(x.v->>'tipo'), '')
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c->'contenedores') = 'array' THEN c->'contenedores' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS x(v, o)
        WHERE jsonb_typeof(x.v) = 'object' AND nullif(btrim(x.v->>'numero'), '') IS NOT NULL
        ON CONFLICT DO NOTHING
        RETURNING 1
      ) SELECT count(*) INTO contenedores FROM ins;
    END IF;
  END IF;

  IF p_documento IS NOT NULL THEN
    UPDATE public.documentos
       SET lectura_operativa = coalesce(p_lectura, '{}'::jsonb) || jsonb_build_object(
             'estado', p_estado, 'procesado_en', now(), 'procesado_por', auth.uid(), 'origen', p_origen,
             'completados', to_jsonb(completados), 'contenedores', contenedores)
     WHERE id = p_documento;
  END IF;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_expediente,
    CASE WHEN p_estado = 'aplicado' THEN 'autocompletado_documento' ELSE 'autocompletado_documento_rechazado' END,
    auth.uid(),
    jsonb_build_object(
      'documento_id', p_documento,
      'origen', p_origen,
      'fuente', coalesce(p_lectura->>'fuente',''),
      'completados', to_jsonb(completados),
      'contenedores', contenedores,
      'alertas', coalesce(p_lectura->'alertas','[]'::jsonb),
      'motivo', coalesce(p_lectura->>'motivo',''),
      'archivo', coalesce(p_lectura->>'archivo','')
    ));

  RETURN jsonb_build_object('completados', to_jsonb(completados), 'contenedores', contenedores);
END;
$function$;

CREATE OR REPLACE FUNCTION public.deshacer_autocompletado_lote(p_lote uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  it public.autocompletado_lotes%ROWTYPE;
  k text;
  permitidos text[] := ARRAY[
    'bl_awb','naviera','puerto_salida','puerto_salida_codigo','puerto_arribo','puerto_arribo_codigo',
    'fecha_cargado','medio_transporte','peso_bruto','peso_neto','cantidad_bultos','tipo_carga',
    'pais_procedencia','pais_procedencia_codigo','suplidor','factura_comercial','total_fob','seguro',
    'flete','otros','incoterm','pais_origen','pais_origen_codigo','descripcion_mercancia'
  ];
  restaurados int := 0;
  contenedores_borrados int := 0;
  cif_cambia boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.autocompletado_lotes WHERE lote_id = p_lote AND deshecho_en IS NULL) THEN
    RAISE EXCEPTION 'El lote no existe o ya fue deshecho';
  END IF;
  FOR it IN SELECT * FROM public.autocompletado_lotes WHERE lote_id = p_lote AND deshecho_en IS NULL ORDER BY id LOOP
    cif_cambia := false;
    FOREACH k IN ARRAY coalesce(ARRAY(SELECT jsonb_object_keys(it.anterior)), '{}'::text[]) LOOP
      IF NOT (k = ANY (permitidos)) THEN CONTINUE; END IF;
      -- El valor anterior se convierte al tipo real de la columna (texto, número o fecha) vía jsonb_populate_record.
      EXECUTE format('UPDATE public.expedientes SET %1$I = (jsonb_populate_record(NULL::public.expedientes, $1)).%1$I, auto_documento = coalesce(auto_documento, ''{}''::jsonb) - $2 WHERE id = $3', k)
        USING jsonb_build_object(k, it.anterior -> k), k, it.expediente_id;
      restaurados := restaurados + 1;
      IF k IN ('total_fob','seguro','flete','otros') THEN cif_cambia := true; END IF;
    END LOOP;
    -- Al restaurar un componente del CIF, el Total CIF vuelve a ser FOB + seguro + flete + otros.
    IF cif_cambia THEN
      UPDATE public.expedientes
         SET total_cif = coalesce(total_fob,0) + coalesce(seguro,0) + coalesce(flete,0) + coalesce(otros,0)
       WHERE id = it.expediente_id;
    END IF;
    IF jsonb_typeof(it.contenedores) = 'array' AND jsonb_array_length(it.contenedores) > 0 THEN
      DELETE FROM public.expediente_contenedores
       WHERE expediente_id = it.expediente_id
         AND numero_contenedor IN (
           SELECT nullif(btrim(x.v->>'numero'), '') FROM jsonb_array_elements(it.contenedores) AS x(v));
      contenedores_borrados := contenedores_borrados + jsonb_array_length(it.contenedores);
    END IF;
    UPDATE public.autocompletado_lotes SET deshecho_en = now(), deshecho_por = auth.uid() WHERE id = it.id;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', it.expediente_id, 'autocompletado_documento_deshecho', auth.uid(),
      jsonb_build_object('lote_id', p_lote, 'documento_id', it.documento_id, 'fuente', it.fuente,
        'campos', coalesce(it.anterior, '{}'::jsonb), 'contenedores', coalesce(it.contenedores, '[]'::jsonb)));
  END LOOP;
  RETURN jsonb_build_object('restaurados', restaurados, 'contenedores', contenedores_borrados);
END;
$function$;

-- Corrección puntual: Expedientes cuyo Otros/Flete/Seguro/FOB se completó desde un documento sin recalcular el Total CIF.
WITH afectados AS (
  SELECT id, total_cif AS anterior,
         coalesce(total_fob,0) + coalesce(seguro,0) + coalesce(flete,0) + coalesce(otros,0) AS nuevo
    FROM public.expedientes
   WHERE auto_documento ?| ARRAY['total_fob','seguro','flete','otros']
     AND eliminado_en IS NULL
     AND total_cif IS DISTINCT FROM coalesce(total_fob,0) + coalesce(seguro,0) + coalesce(flete,0) + coalesce(otros,0)
), upd AS (
  UPDATE public.expedientes e SET total_cif = a.nuevo FROM afectados a WHERE e.id = a.id RETURNING e.id
)
INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
SELECT 'expedientes', a.id, 'total_cif_recalculado', NULL,
       jsonb_build_object('anterior', a.anterior, 'nuevo', a.nuevo,
         'motivo', 'Total CIF recalculado tras completar Otros/Flete/Seguro/FOB desde un documento')
  FROM afectados a JOIN upd u ON u.id = a.id;