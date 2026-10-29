DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.convertir_correo_cotizacion(uuid,uuid)'::regprocedure) INTO definition;
 IF position('contacto)' in definition)=0 THEN RAISE EXCEPTION 'La definición de conversión cambió'; END IF;
 definition:=replace(definition,'peso_kg,tipo_carga,contacto)','peso_kg,tipo_carga,contacto,tarifa_propuesta,moneda)');
 definition:=replace(definition,'s.remitente_correo) RETURNING id', 's.remitente_correo,CASE WHEN jsonb_typeof(v_datos->''total_factura'')=''number'' AND (v_datos->>''total_factura'')::numeric >= 0 THEN (v_datos->>''total_factura'')::numeric ELSE NULL END,CASE WHEN v_datos->>''moneda_factura'' IN (''USD'',''DOP'',''EUR'') THEN (v_datos->>''moneda_factura'')::public.moneda ELSE ''USD''::public.moneda END) RETURNING id');
 EXECUTE definition;
END;$migration$;