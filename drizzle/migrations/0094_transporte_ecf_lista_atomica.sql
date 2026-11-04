CREATE OR REPLACE FUNCTION public.guardar_facturas_transporte(_transporte_id uuid, _anteriores uuid[], _facturas uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_actuales uuid[]; v_id uuid;
BEGIN
  PERFORM 1 FROM public.transportes WHERE id=_transporte_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(array_agg(factura_ecf_id ORDER BY factura_ecf_id), ARRAY[]::uuid[]) INTO v_actuales FROM public.transporte_facturas_ecf WHERE transporte_id=_transporte_id;
  IF v_actuales IS DISTINCT FROM ARRAY(SELECT unnest(_anteriores) ORDER BY 1) THEN RETURN false; END IF;
  FOREACH v_id IN ARRAY _facturas LOOP
    IF NOT v_id=ANY(v_actuales) AND NOT EXISTS (SELECT 1 FROM public.facturas_ecf WHERE id=v_id AND eliminado_en IS NULL) THEN RAISE EXCEPTION 'Factura no disponible'; END IF;
  END LOOP;
  DELETE FROM public.transporte_facturas_ecf WHERE transporte_id=_transporte_id AND NOT factura_ecf_id=ANY(_facturas);
  INSERT INTO public.transporte_facturas_ecf(transporte_id,factura_ecf_id) SELECT _transporte_id, v FROM unnest(_facturas) v WHERE NOT v=ANY(v_actuales);
  IF cardinality(_facturas)=0 AND cardinality(v_actuales)>0 THEN UPDATE public.transportes SET ingreso_facturado=0,factura_ecf_id=NULL WHERE id=_transporte_id; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.guardar_facturas_transporte(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_facturas_transporte(uuid,uuid[],uuid[]) TO authenticated,service_role;
UPDATE public.transportes t SET ingreso_facturado=(SELECT COALESCE(sum(f.monto_total),0) FROM public.transporte_facturas_ecf l JOIN public.facturas_ecf f ON f.id=l.factura_ecf_id AND f.eliminado_en IS NULL WHERE l.transporte_id=t.id)
WHERE EXISTS (SELECT 1 FROM public.transporte_facturas_ecf WHERE transporte_id=t.id);
COMMENT ON COLUMN public.transportes.factura_ecf_id IS 'Compatibility primary invoice; canonical invoice membership is transporte_facturas_ecf.';