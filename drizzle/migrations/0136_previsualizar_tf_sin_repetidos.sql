-- Vista previa de los próximos N números: primero los liberados, luego la secuencia, sin repetir un liberado
-- que coincida con el siguiente de la secuencia (p. ej. liberado por encima del último TF usado).
CREATE OR REPLACE FUNCTION public.previsualizar_tf(p_cantidad integer)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint; v_tf text; r text[] := '{}';
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la secuencia TF';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 100 THEN RAISE EXCEPTION 'Cantidad entre 1 y 100'; END IF;
  FOR v_tf IN SELECT secuencia FROM public.tf_sin_uso_notas WHERE reutilizar AND private.tf_libre(secuencia)
      ORDER BY substring(secuencia FROM 4)::bigint LOOP
    EXIT WHEN cardinality(r) >= p_cantidad;
    r := r || v_tf;
  END LOOP;
  IF cardinality(r) >= p_cantidad THEN RETURN r; END IF;
  n := substring(public.siguiente_tf() FROM 4)::bigint;
  LOOP
    v_tf := 'TF-' || lpad(n::text, 7, '0');
    IF NOT v_tf = ANY(r)
       AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transferencia WHERE secuencia = v_tf)
       AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transporte WHERE numero_control = v_tf)
       AND NOT EXISTS (SELECT 1 FROM public.transportes WHERE replace(numero_control_pago, '-', '') = replace(v_tf, '-', '')) THEN
      r := r || v_tf;
    END IF;
    EXIT WHEN cardinality(r) >= p_cantidad;
    n := n + 1;
  END LOOP;
  RETURN r;
END $$;