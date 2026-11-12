-- Permite aplicar el lote excluyendo hitos concretos (p. ej. fechas de una carga masiva que se completarán a mano).
DROP FUNCTION IF EXISTS public.aplicar_lote_hitos_retroactivos();
CREATE OR REPLACE FUNCTION public.aplicar_lote_hitos_retroactivos(p_excluir uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lote uuid; v_n integer; v_prev public.hito_estado; r record; v_excl jsonb;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Solo un administrador puede aplicar el lote.'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('hito_id', c.hito_id, 'numero', c.numero, 'hito', c.hito_codigo, 'fecha', c.fecha) ORDER BY c.numero), '[]'::jsonb)
    INTO v_excl FROM public.hitos_retroactivos_candidatos() c WHERE c.hito_id = ANY(COALESCE(p_excluir, '{}'::uuid[]));
  INSERT INTO public.hitos_lotes (descripcion, creado_por)
  VALUES ('Completado retroactivo de hitos 1, 2, 4 y 8' ||
          CASE WHEN jsonb_array_length(v_excl) > 0 THEN ' (' || jsonb_array_length(v_excl) || ' excluidos para completar a mano)' ELSE '' END,
          auth.uid()) RETURNING id INTO v_lote;
  FOR r IN SELECT * FROM public.hitos_retroactivos_candidatos() c WHERE NOT (c.hito_id = ANY(COALESCE(p_excluir, '{}'::uuid[]))) LOOP
    SELECT h.estado INTO v_prev FROM public.expediente_hitos h
     WHERE h.id = r.hito_id AND h.fecha_cumplimiento IS NULL AND h.auto_origen IS NULL AND h.estado NOT IN ('completado', 'no_aplica')
     FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    UPDATE public.expediente_hitos
       SET fecha_cumplimiento = r.fecha, estado = 'completado', auto_origen = r.origen, auto_fecha = r.evento_fecha,
           auto_detalle = COALESCE(r.detalle, '{}'::jsonb) || jsonb_build_object('retroactivo', true, 'lote_id', v_lote),
           auto_ref_id = r.ref_id, auto_correo_id = r.correo_id, auto_solicitud_id = r.solicitud_id
     WHERE id = r.hito_id;
    INSERT INTO public.hitos_lote_items (lote_id, hito_id, expediente_id, hito_codigo, origen, fecha, evento_fecha, prev_estado)
    VALUES (v_lote, r.hito_id, r.expediente_id, r.hito_codigo, r.origen, r.fecha, r.evento_fecha, v_prev);
  END LOOP;
  SELECT count(*) INTO v_n FROM public.hitos_lote_items WHERE lote_id = v_lote;
  UPDATE public.hitos_lotes SET total = v_n WHERE id = v_lote;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('hitos_lotes', v_lote, 'lote_hitos_retroactivo', auth.uid(), jsonb_build_object(
    'total', v_n,
    'por_hito', COALESCE((SELECT jsonb_object_agg(hito_codigo, n) FROM (SELECT hito_codigo, count(*) n FROM public.hitos_lote_items WHERE lote_id = v_lote GROUP BY 1) x), '{}'::jsonb),
    'excluidos', v_excl));
  RETURN v_lote;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_lote_hitos_retroactivos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_hitos_retroactivos(uuid[]) TO authenticated;