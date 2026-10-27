CREATE OR REPLACE FUNCTION public.fusionar_datos_correo(p_anterior jsonb, p_nuevo jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v_resultado jsonb := coalesce(p_anterior, '{}'::jsonb); v_clave text; v_valor jsonb;
BEGIN
 IF jsonb_typeof(p_nuevo) <> 'object' THEN RETURN v_resultado; END IF;
 FOR v_clave, v_valor IN SELECT * FROM jsonb_each(p_nuevo) LOOP
  IF v_valor IS NULL OR v_valor IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb) THEN CONTINUE; END IF;
  IF jsonb_typeof(v_valor)='object' THEN v_valor := public.fusionar_datos_correo(v_resultado->v_clave,v_valor); END IF;
  v_resultado := jsonb_set(v_resultado, ARRAY[v_clave], v_valor, true);
 END LOOP;
 RETURN v_resultado;
END; $$;
CREATE OR REPLACE FUNCTION public.fusionar_adjuntos_correo(p_anterior jsonb,p_nuevo jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v_resultado jsonb := '[]'::jsonb; v_adjunto jsonb; v_existente jsonb; v_nombre text;
BEGIN
 FOR v_adjunto IN SELECT value FROM jsonb_array_elements(coalesce(p_anterior,'[]'::jsonb) || coalesce(p_nuevo,'[]'::jsonb)) LOOP
  v_nombre := lower(btrim(v_adjunto->>'nombre'));
  SELECT value INTO v_existente FROM jsonb_array_elements(v_resultado) WHERE lower(btrim(value->>'nombre'))=v_nombre LIMIT 1;
  IF v_existente IS NOT NULL THEN
   IF v_adjunto ? 'error' OR (v_adjunto->>'tipo'='Otro' AND v_existente->>'tipo'<>'Otro') THEN
    v_adjunto := public.fusionar_datos_correo(v_adjunto,v_existente);
   ELSE
    v_adjunto := public.fusionar_datos_correo(v_existente,v_adjunto) - 'error';
   END IF;
   SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO v_resultado FROM jsonb_array_elements(v_resultado) WHERE lower(btrim(value->>'nombre'))<>v_nombre;
  END IF;
  v_resultado := v_resultado || jsonb_build_array(v_adjunto);
 END LOOP;
 RETURN v_resultado;
END; $$;
CREATE OR REPLACE FUNCTION public.guardar_solicitud_correo_pendiente(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 v_id uuid; v_actual public.solicitudes_correo%ROWTYPE; v_datos jsonb;
 v_remitente text := coalesce(nullif(lower(btrim(p_solicitud->>'remitente_correo')),''),lower(btrim(p_solicitud->>'remitente')));
 v_bl text := nullif(upper(btrim(p_solicitud->>'bl_awb')),'');
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(v_remitente,0));
 SELECT * INTO v_actual FROM public.solicitudes_correo s
 WHERE s.estado='pendiente'
 AND coalesce(nullif(lower(btrim(s.remitente_correo)),''),lower(btrim(s.remitente)))=v_remitente
 AND ((v_bl IS NOT NULL AND nullif(upper(btrim(s.bl_awb)),'')=v_bl)
 OR (v_bl IS NULL AND nullif(btrim(s.bl_awb),'') IS NULL AND s.asunto=p_solicitud->>'asunto'))
 ORDER BY s.created_at,s.id LIMIT 1 FOR UPDATE;
 IF v_actual.id IS NOT NULL THEN
  v_datos := public.fusionar_datos_correo(to_jsonb(v_actual),p_solicitud);
  UPDATE public.solicitudes_correo SET
   cuerpo=v_datos->>'cuerpo', mensaje_aislado=v_datos->>'mensaje_aislado',
   bl_awb=v_datos->>'bl_awb', eta=nullif(v_datos->>'eta','')::date,
   producto=v_datos->>'producto',cantidad=v_datos->>'cantidad',cliente_nombre=v_datos->>'cliente_nombre',
   peso_bruto_kg=nullif(v_datos->>'peso_bruto_kg','')::numeric,factura_comercial=v_datos->>'factura_comercial',
   cliente_id=nullif(v_datos->>'cliente_id','')::uuid,destinatarios=v_datos->>'destinatarios',cc=v_datos->>'cc',
   advertencias=ARRAY(SELECT DISTINCT x FROM unnest(coalesce(v_actual.advertencias,'{}'::text[]) || ARRAY(SELECT jsonb_array_elements_text(coalesce(p_solicitud->'advertencias','[]'::jsonb)))) x),
   adjuntos=public.fusionar_adjuntos_correo(v_actual.adjuntos,p_solicitud->'adjuntos')
  WHERE id=v_actual.id AND estado='pendiente' RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'actualizado',true);
 END IF;
 INSERT INTO public.solicitudes_correo(remitente,remitente_correo,asunto,cuerpo,mensaje_aislado,bl_awb,eta,producto,cantidad,cliente_nombre,peso_bruto_kg,factura_comercial,advertencias,cliente_id,adjuntos,destinatarios,cc)
 VALUES(p_solicitud->>'remitente',p_solicitud->>'remitente_correo',p_solicitud->>'asunto',p_solicitud->>'cuerpo',p_solicitud->>'mensaje_aislado',p_solicitud->>'bl_awb',nullif(p_solicitud->>'eta','')::date,p_solicitud->>'producto',p_solicitud->>'cantidad',p_solicitud->>'cliente_nombre',nullif(p_solicitud->>'peso_bruto_kg','')::numeric,p_solicitud->>'factura_comercial',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_solicitud->'advertencias','[]'::jsonb))),nullif(p_solicitud->>'cliente_id','')::uuid,coalesce(p_solicitud->'adjuntos','[]'::jsonb),nullif(p_solicitud->>'destinatarios',''),nullif(p_solicitud->>'cc','')) RETURNING id INTO v_id;
 RETURN jsonb_build_object('id',v_id,'actualizado',false);
END; $$;
CREATE OR REPLACE FUNCTION public.crear_solicitud_correo_sin_duplicado(p_solicitud jsonb)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT (public.guardar_solicitud_correo_pendiente(p_solicitud)->>'id')::uuid $$;
REVOKE ALL ON FUNCTION public.fusionar_datos_correo(jsonb,jsonb),public.fusionar_adjuntos_correo(jsonb,jsonb),public.guardar_solicitud_correo_pendiente(jsonb),public.crear_solicitud_correo_sin_duplicado(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fusionar_datos_correo(jsonb,jsonb),public.fusionar_adjuntos_correo(jsonb,jsonb),public.guardar_solicitud_correo_pendiente(jsonb),public.crear_solicitud_correo_sin_duplicado(jsonb) TO service_role;