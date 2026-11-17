ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS auto_documento jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.expedientes.auto_documento IS
  'Campos completados desde el BL/AWB o la Factura comercial: {campo: {valor, documento_id, fuente, fecha, origen}}. La etiqueta Automático solo se muestra mientras el valor actual coincide.';

ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS lectura_operativa jsonb;

COMMENT ON COLUMN public.documentos.lectura_operativa IS
  'Resultado de leer el BL/AWB o la Factura comercial, ligado al archivo que se leyó. Al reemplazar el archivo queda obsoleto y se vuelve a leer.';

CREATE OR REPLACE FUNCTION public.aplicar_autocompletado_operativo(
  p_expediente uuid, p_documento uuid, p_estado text, p_campos jsonb, p_lectura jsonb, p_origen text
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

    IF c ? 'contenedores' AND NOT EXISTS (SELECT 1 FROM public.expediente_contenedores WHERE expediente_id = p_expediente) THEN
      WITH ins AS (
        INSERT INTO public.expediente_contenedores (expediente_id, item_no, numero_contenedor, sello1, sello2, tipo_contenedor)
        SELECT p_expediente, (x.ordinality)::int, nullif(btrim(x.numero), ''), nullif(btrim(x.sello1), ''),
          nullif(btrim(x.sello2), ''), nullif(btrim(x.tipo), '')
        FROM jsonb_to_recordset(coalesce(c->'contenedores','[]'::jsonb))
          WITH ORDINALITY AS x(numero text, sello1 text, sello2 text, tipo text, ordinality int)
        WHERE nullif(btrim(x.numero), '') IS NOT NULL
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
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_autocompletado_operativo(uuid, uuid, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_autocompletado_operativo(uuid, uuid, text, jsonb, jsonb, text) TO service_role;