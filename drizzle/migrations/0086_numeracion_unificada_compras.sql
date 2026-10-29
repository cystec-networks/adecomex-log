CREATE TABLE public.numeracion_operaciones_contadores (periodo text PRIMARY KEY CHECK (periodo ~ '^[0-9]{6}$'), ultima_secuencia bigint NOT NULL DEFAULT 0);
GRANT ALL ON public.numeracion_operaciones_contadores TO service_role;
ALTER TABLE public.numeracion_operaciones_contadores ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.numeracion_operaciones_contadores IS 'Shared monthly high-water mark for purchase and expediente numbers; no client writes or number reuse after deletion.';
CREATE OR REPLACE FUNCTION public.siguiente_numero_operacion(p_tipo text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pref text := to_char(now() AT TIME ZONE 'America/Santo_Domingo','YYYYMM'); sig bigint; existente bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 SELECT coalesce(max(substring(numero from 8)::bigint),0) INTO existente FROM (
  SELECT numero FROM public.expedientes UNION ALL SELECT numero FROM public.cotizaciones UNION ALL SELECT numero FROM public.ordenes
 ) x WHERE numero ~ ('^'||pref||'[IE][0-9]+$');
 INSERT INTO public.numeracion_operaciones_contadores(periodo,ultima_secuencia) VALUES(pref,existente+1)
 ON CONFLICT(periodo) DO UPDATE SET ultima_secuencia=greatest(public.numeracion_operaciones_contadores.ultima_secuencia,existente)+1
 RETURNING ultima_secuencia INTO sig;
 RETURN pref||CASE WHEN p_tipo ILIKE 'export%' THEN 'E' ELSE 'I' END||sig::text;
END $$;
REVOKE ALL ON FUNCTION public.siguiente_numero_operacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_operacion(text) TO service_role;
CREATE OR REPLACE FUNCTION public.cotizaciones_set_numero() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.numero := public.siguiente_numero_operacion(NEW.tipo_operacion);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ordenes_set_numero() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.cotizacion_id IS NOT NULL THEN
  SELECT numero INTO NEW.numero FROM public.cotizaciones WHERE id=NEW.cotizacion_id;
  IF NEW.numero IS NULL THEN RAISE EXCEPTION 'Cotización de origen no disponible'; END IF;
 ELSE
  NEW.numero := public.siguiente_numero_operacion(NEW.cot_tipo_operacion);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.asignar_numero_expediente() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.orden_id IS NOT NULL THEN
  SELECT numero INTO NEW.numero FROM public.ordenes WHERE id=NEW.orden_id;
  IF NEW.numero IS NULL THEN RAISE EXCEPTION 'Orden de origen no disponible'; END IF;
 ELSIF NEW.numero IS NULL OR btrim(NEW.numero)='' OR NEW.numero LIKE 'EXP-%' THEN
  NEW.numero := public.siguiente_numero_operacion(NEW.tipo_operacion);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validar_numero_operacion_unico() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cot_id uuid; ord_id uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.numero IS NOT DISTINCT FROM OLD.numero THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 IF TG_TABLE_NAME='cotizaciones' THEN cot_id:=NEW.id;
 ELSIF TG_TABLE_NAME='ordenes' THEN ord_id:=NEW.id; cot_id:=NEW.cotizacion_id;
 ELSE ord_id:=NEW.orden_id; SELECT cotizacion_id INTO cot_id FROM public.ordenes WHERE id=ord_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.cotizaciones c WHERE c.numero=NEW.numero AND c.id IS DISTINCT FROM cot_id)
 OR EXISTS(SELECT 1 FROM public.ordenes o WHERE o.numero=NEW.numero AND o.id IS DISTINCT FROM ord_id AND NOT (TG_TABLE_NAME='cotizaciones' AND o.cotizacion_id IS NOT DISTINCT FROM NEW.id))
 OR EXISTS(SELECT 1 FROM public.expedientes e WHERE e.numero=NEW.numero AND NOT (TG_TABLE_NAME='expedientes' AND e.id=NEW.id) AND NOT (TG_TABLE_NAME='ordenes' AND e.orden_id IS NOT DISTINCT FROM NEW.id) AND NOT (TG_TABLE_NAME='cotizaciones' AND EXISTS(SELECT 1 FROM public.ordenes o WHERE o.id=e.orden_id AND o.cotizacion_id=NEW.id)))
 THEN RAISE EXCEPTION 'El número % ya pertenece a otra operación.',NEW.numero USING ERRCODE='23505'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (TG_TABLE_NAME='ordenes' AND cot_id IS NOT NULL) OR (TG_TABLE_NAME='expedientes' AND ord_id IS NOT NULL)
  OR (TG_TABLE_NAME='cotizaciones' AND EXISTS(SELECT 1 FROM public.ordenes WHERE cotizacion_id=NEW.id))
  OR (TG_TABLE_NAME='ordenes' AND EXISTS(SELECT 1 FROM public.expedientes WHERE orden_id=NEW.id))
  THEN RAISE EXCEPTION 'La operación vinculada debe conservar su número de origen.' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_validar_numero_compra BEFORE INSERT OR UPDATE OF numero ON public.cotizaciones FOR EACH ROW EXECUTE FUNCTION public.validar_numero_operacion_unico();
CREATE TRIGGER zz_validar_numero_orden BEFORE INSERT OR UPDATE OF numero ON public.ordenes FOR EACH ROW EXECUTE FUNCTION public.validar_numero_operacion_unico();
CREATE TRIGGER zz_validar_numero_expediente BEFORE INSERT OR UPDATE OF numero ON public.expedientes FOR EACH ROW EXECUTE FUNCTION public.validar_numero_operacion_unico();
COMMENT ON SEQUENCE public.cotizaciones_seq IS 'DEPRECATED: new quotes use siguiente_numero_operacion and the shared monthly counter.';
COMMENT ON SEQUENCE public.ordenes_seq IS 'DEPRECATED: orders inherit quote numbers or use siguiente_numero_operacion.';
DO $patch$
DECLARE definicion text;
BEGIN
 definicion:=pg_get_functiondef('public.convertir_correo_cotizacion(uuid,uuid)'::regprocedure);
 IF position('contacto,tarifa_propuesta,moneda)' in definicion)=0 THEN RAISE EXCEPTION 'Conversión por correo inesperada'; END IF;
 definicion:=replace(definicion,'contacto,tarifa_propuesta,moneda)','contacto,tarifa_propuesta,moneda,tipo_operacion)');
 definicion:=replace(definicion,$old$ELSE 'USD'::public.moneda END) RETURNING id INTO v_id;$old$,$new$ELSE 'USD'::public.moneda END,CASE WHEN v_datos->>'tipo_operacion' ILIKE 'export%' THEN 'Exportación' ELSE 'Importación' END) RETURNING id INTO v_id;$new$);
 EXECUTE definicion;
END $patch$;