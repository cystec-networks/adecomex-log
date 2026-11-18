CREATE OR REPLACE FUNCTION public.guardar_facturas_transporte(_transporte_id uuid, _anteriores uuid[], _facturas uuid[])
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_actuales uuid[]; v_id uuid; v_num text; v_usuario text;
BEGIN
  SELECT numero_viaje INTO v_num FROM public.transportes WHERE id=_transporte_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(array_agg(factura_ecf_id ORDER BY factura_ecf_id), ARRAY[]::uuid[]) INTO v_actuales FROM public.transporte_facturas_ecf WHERE transporte_id=_transporte_id;
  IF v_actuales IS DISTINCT FROM ARRAY(SELECT unnest(_anteriores) ORDER BY 1) THEN RETURN false; END IF;
  FOREACH v_id IN ARRAY _facturas LOOP
    IF NOT v_id=ANY(v_actuales) AND NOT EXISTS (SELECT 1 FROM public.facturas_ecf WHERE id=v_id AND eliminado_en IS NULL) THEN RAISE EXCEPTION 'Factura no disponible'; END IF;
  END LOOP;
  -- Facturas repartidas con montos asignados solo se cambian desde «Vincular» (los montos deben cuadrar).
  IF EXISTS (SELECT 1 FROM public.facturas_ecf_asignaciones a
              WHERE a.factura_id IN (SELECT unnest(_facturas) EXCEPT SELECT unnest(v_actuales)
                                     UNION SELECT unnest(v_actuales) EXCEPT SELECT unnest(_facturas))) THEN
    RAISE EXCEPTION 'Una de las facturas está repartida con montos asignados; cámbiala desde «Vincular» en Facturación';
  END IF;
  SELECT nombre INTO v_usuario FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'transportes', _transporte_id, 'factura_ecf_desvinculada', auth.uid(),
         jsonb_build_object('factura_id', f.id, 'encf', f.encf, 'destino', v_num, 'usuario', v_usuario)
    FROM public.facturas_ecf f WHERE f.id IN (SELECT unnest(v_actuales) EXCEPT SELECT unnest(_facturas));
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'transportes', _transporte_id, 'factura_ecf_vinculada', auth.uid(),
         jsonb_build_object('factura_id', f.id, 'encf', f.encf, 'destino', v_num, 'monto', f.monto_total, 'usuario', v_usuario)
    FROM public.facturas_ecf f WHERE f.id IN (SELECT unnest(_facturas) EXCEPT SELECT unnest(v_actuales));
  DELETE FROM public.transporte_facturas_ecf WHERE transporte_id=_transporte_id AND NOT factura_ecf_id=ANY(_facturas);
  INSERT INTO public.transporte_facturas_ecf(transporte_id,factura_ecf_id) SELECT _transporte_id, v FROM unnest(_facturas) v WHERE NOT v=ANY(v_actuales);
  IF cardinality(_facturas)=0 AND cardinality(v_actuales)>0 THEN UPDATE public.transportes SET ingreso_facturado=0,factura_ecf_id=NULL WHERE id=_transporte_id; END IF;
  RETURN true;
END $function$;