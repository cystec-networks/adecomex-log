ALTER TABLE public.solicitudes_correo ADD COLUMN cotizacion_id uuid REFERENCES public.cotizaciones(id) ON DELETE RESTRICT;
ALTER TABLE public.solicitudes_correo DROP CONSTRAINT solicitudes_correo_estado_check;
ALTER TABLE public.solicitudes_correo ADD CONSTRAINT solicitudes_correo_estado_check CHECK (estado IN ('pendiente','confirmada','descartada','convertida'));
CREATE INDEX solicitudes_correo_cotizacion_idx ON public.solicitudes_correo(cotizacion_id) WHERE cotizacion_id IS NOT NULL;
CREATE POLICY "Gestor convierte correos comerciales" ON public.solicitudes_correo FOR UPDATE TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['vendedor'::public.app_role])) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['vendedor'::public.app_role]) AND estado='convertida' AND cotizacion_id IS NOT NULL AND expediente_id IS NULL);
CREATE OR REPLACE FUNCTION public.convertir_correo_cotizacion(p_solicitud_id uuid, p_cotizacion_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $function$
DECLARE s public.solicitudes_correo%ROWTYPE; c public.cotizaciones%ROWTYPE; v_id uuid; a jsonb; d jsonb; l jsonb; i integer:=0; v_documento text; v_datos jsonb:='{}'; v_lineas jsonb:='[]'; v_duplicado uuid;
BEGIN
 IF NOT private.has_any_role(auth.uid(), ARRAY['admin'::public.app_role,'vendedor'::public.app_role]) THEN RAISE EXCEPTION 'Solo Administrador o Gestor de Compra puede convertir correos a cotizaciones.' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.solicitudes_correo WHERE id=p_solicitud_id FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
 IF s.estado='convertida' AND s.cotizacion_id IS NOT NULL THEN RETURN s.cotizacion_id; END IF;
 IF s.estado<>'pendiente' OR s.expediente_id IS NOT NULL THEN RAISE EXCEPTION 'La solicitud ya fue procesada'; END IF;
 IF s.cliente_id IS NULL THEN RAISE EXCEPTION 'Selecciona un cliente registrado antes de convertir.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('correo-cotizacion:'||s.cliente_id::text,0));
 IF p_cotizacion_id IS NOT NULL THEN
  SELECT * INTO c FROM public.cotizaciones WHERE id=p_cotizacion_id AND cliente_id=s.cliente_id AND deleted_at IS NULL FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'La cotización debe pertenecer al mismo cliente y estar activa.'; END IF;
  v_id:=c.id;
 ELSE
  SELECT x.cotizacion_id INTO v_duplicado FROM public.solicitudes_correo x JOIN public.cotizaciones q ON q.id=x.cotizacion_id AND q.deleted_at IS NULL
   WHERE x.estado='convertida' AND x.cliente_id=s.cliente_id AND x.cotizacion_id IS NOT NULL
   AND ((nullif(s.id_hilo,'') IS NOT NULL AND x.id_hilo=s.id_hilo)
    OR (nullif(s.bl_awb,'') IS NOT NULL AND upper(btrim(x.bl_awb))=upper(btrim(s.bl_awb)))
    OR (nullif(s.factura_comercial,'') IS NOT NULL AND x.factura_comercial=s.factura_comercial)) LIMIT 1;
  IF v_duplicado IS NOT NULL THEN RAISE EXCEPTION 'Este hilo, factura o BL ya está vinculado a una cotización. Selecciona la cotización existente.'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(s.adjuntos,'[]'::jsonb)) LOOP
   IF lower(coalesce(a->>'tipo','')) IN ('factura proforma','factura comercial') OR coalesce(a->>'nombre','') ~* 'pro[ -]?forma' THEN
    IF v_documento IS NULL THEN v_documento:=nullif(a->>'storage_path',''); v_datos:=coalesce(a->'datos','{}'::jsonb); END IF;
    d:=coalesce(a->'datos','{}'::jsonb);
    IF jsonb_typeof(d->'lineas_factura')='array' THEN v_lineas:=v_lineas||(d->'lineas_factura'); END IF;
   END IF;
  END LOOP;
  INSERT INTO public.cotizaciones(cliente_id,estado,fecha_emision,notas,documento_url,suplidor,origen,destino,incoterm,peso_kg,tipo_carga,contacto)
   VALUES(s.cliente_id,'solicitada',(now() AT TIME ZONE 'America/Santo_Domingo')::date,
    concat_ws(E'\n','Solicitud recibida por correo: '||s.asunto,s.producto,s.cantidad),v_documento,v_datos->>'suplidor',v_datos->>'puerto_salida',v_datos->>'puerto_arribo',v_datos->>'incoterm',s.peso_bruto_kg,v_datos->>'tipo_carga',s.remitente_correo) RETURNING id INTO v_id;
  IF jsonb_array_length(v_lineas)=0 AND nullif(s.producto,'') IS NOT NULL THEN
   v_lineas:=jsonb_build_array(jsonb_build_object('descripcion',s.producto,'cantidad',CASE WHEN s.cantidad ~ '^\s*[0-9]+(\.[0-9]+)?\s*[[:alpha:]]*\s*$' THEN substring(s.cantidad from '[0-9]+(\.[0-9]+)?')::numeric ELSE NULL END,'unidad',null));
  END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(v_lineas) LOOP
   i:=i+1;
   INSERT INTO public.cotizacion_productos(cotizacion_id,item_no,detalle_producto,codigo_arancelario,unidad_medida,cantidad,peso,valor_fob)
    VALUES(v_id,i,l->>'descripcion',nullif(l->>'codigo_arancelario',''),l->>'unidad',nullif(l->>'cantidad','')::numeric,nullif(l->>'peso','')::numeric,nullif(l->>'valor_fob','')::numeric);
  END LOOP;
 END IF;
 UPDATE public.solicitudes_correo SET estado='convertida',cotizacion_id=v_id WHERE id=s.id AND estado='pendiente';
 IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo marcar el correo convertido'; END IF;
 RETURN v_id;
END;$function$;
REVOKE ALL ON FUNCTION public.convertir_correo_cotizacion(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convertir_correo_cotizacion(uuid,uuid) TO authenticated;
