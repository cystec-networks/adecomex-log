ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS lote_conciliacion uuid;
CREATE INDEX IF NOT EXISTS banco_movimientos_lote_conciliacion_idx ON public.banco_movimientos(lote_conciliacion) WHERE lote_conciliacion IS NOT NULL;

-- Concilia en bloque débitos con su única sugerencia exacta (una entrada, mismo monto, ±3 días, sin diferencia).
-- Todo o nada: si un par ya no es exacto o está ocupado, no se concilia ninguno.
CREATE OR REPLACE FUNCTION public.conciliar_exactas_lote(p_pares jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_n int; r record;
  m public.banco_movimientos%ROWTYPE; e record; v_total numeric := 0;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF p_pares IS NULL OR jsonb_typeof(p_pares) <> 'array' OR jsonb_array_length(p_pares) = 0 THEN
    RAISE EXCEPTION 'Elige al menos un débito';
  END IF;
  v_n := jsonb_array_length(p_pares);
  IF (SELECT count(DISTINCT x.movimiento_id) FROM jsonb_to_recordset(p_pares) AS x(movimiento_id uuid, origen_tipo text, solicitud_id uuid)) <> v_n
     OR (SELECT count(DISTINCT (x.origen_tipo, x.solicitud_id)) FROM jsonb_to_recordset(p_pares) AS x(movimiento_id uuid, origen_tipo text, solicitud_id uuid)) <> v_n THEN
    RAISE EXCEPTION 'Cada débito y cada entrada del Diario solo pueden aparecer una vez en el lote';
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_pares) AS x(movimiento_id uuid, origen_tipo text, solicitud_id uuid) LOOP
    SELECT * INTO m FROM public.banco_movimientos WHERE id = r.movimiento_id FOR UPDATE;
    IF NOT FOUND OR m.tipo <> 'debito' OR m.conciliado THEN
      RAISE EXCEPTION 'Un débito ya no está pendiente. Vuelve a abrir la vista previa.';
    END IF;
    SELECT v.secuencia, v.neto, v.fecha, v.conciliado, v.estado INTO e
    FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
    IF NOT FOUND OR coalesce(e.conciliado, false) OR e.estado = 'anulada' THEN
      RAISE EXCEPTION 'La entrada del débito del % por RD$ % ya no está disponible. Vuelve a abrir la vista previa.', to_char(m.fecha, 'DD/MM/YYYY'), m.monto;
    END IF;
    IF round(m.monto, 2) <> round(e.neto, 2) OR abs(m.fecha - e.fecha) > 3 THEN
      RAISE EXCEPTION 'La entrada % ya no coincide exacta con el débito del % (monto o fecha). Vuelve a abrir la vista previa.', e.secuencia, to_char(m.fecha, 'DD/MM/YYYY');
    END IF;
    PERFORM public.conciliar_movimiento_diario(m.id,
      jsonb_build_array(jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id)), NULL);
    UPDATE public.banco_movimientos SET lote_conciliacion = v_lote WHERE id = m.id;
    v_total := v_total + m.monto;
  END LOOP;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', v_lote, 'LOTE_SUGERENCIAS_EXACTAS', v_uid,
    jsonb_build_object('cantidad', v_n, 'total', v_total));

  RETURN jsonb_build_object('lote', v_lote, 'cantidad', v_n, 'total', v_total);
END $function$;

-- Deshace un lote completo de sugerencias exactas: vuelve a Pendiente cada débito que siga conciliado por ese lote.
CREATE OR REPLACE FUNCTION public.deshacer_lote_conciliacion(p_lote uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_n int := 0; r record;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para deshacer conciliaciones';
  END IF;
  FOR r IN SELECT id FROM public.banco_movimientos
    WHERE lote_conciliacion = p_lote AND conciliado AND conciliado_tipo = 'diario' FOR UPDATE LOOP
    PERFORM public.deshacer_conciliacion_banco(r.id, false, 'Lote de sugerencias exactas deshecho');
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.banco_movimientos SET lote_conciliacion = NULL WHERE lote_conciliacion = p_lote;
  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', p_lote, 'LOTE_SUGERENCIAS_EXACTAS_DESHECHO', v_uid, jsonb_build_object('cantidad', v_n));
  RETURN v_n;
END $function$;

-- El deshacer individual también saca el débito de su lote, para que deshacer el lote nunca toque una conciliación posterior.
CREATE OR REPLACE FUNCTION public.deshacer_conciliacion_banco(p_movimiento uuid, p_anular_creada boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m public.banco_movimientos%ROWTYPE; v_uid uuid := auth.uid(); v_creada_id uuid; v_creada_sec text; v_anulada boolean := false;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para deshacer conciliaciones';
  END IF;
  SELECT * INTO m FROM public.banco_movimientos WHERE id = p_movimiento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF NOT m.conciliado THEN RAISE EXCEPTION 'El movimiento ya está pendiente. Recarga la pantalla.'; END IF;

  SELECT id, secuencia INTO v_creada_id, v_creada_sec FROM public.solicitudes_pago_transferencia
  WHERE banco_movimiento_id = m.id AND origen = 'banco' AND estado = 'pagada' LIMIT 1;

  DELETE FROM public.banco_conciliaciones WHERE movimiento_id = m.id;

  IF p_anular_creada AND v_creada_id IS NOT NULL THEN
    UPDATE public.solicitudes_pago_transferencia SET estado = 'anulada', anulado_en = now(), anulado_por = v_uid,
      anulado_motivo = coalesce(nullif(trim(p_motivo), ''), 'Conciliación bancaria deshecha')
    WHERE id = v_creada_id;
    v_anulada := true;
  END IF;

  UPDATE public.banco_movimientos SET conciliado = false, conciliado_tipo = NULL, conciliado_id = NULL,
    conciliado_por = NULL, conciliado_en = NULL, notas = NULL, diferencia_diario = NULL,
    motivo_diferencia = NULL, vinculado_movimiento_id = NULL, lote_conciliacion = NULL
  WHERE id = m.id;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', m.id, 'CONCILIACION_DESHECHA', v_uid, jsonb_build_object(
    'tipo_anterior', m.conciliado_tipo, 'notas_anteriores', m.notas, 'entrada_creada', v_creada_sec,
    'entrada_anulada', v_anulada, 'motivo', nullif(trim(p_motivo), ''), 'lote', m.lote_conciliacion));

  RETURN jsonb_build_object('anulada', CASE WHEN v_anulada THEN v_creada_sec END);
END $function$;

REVOKE ALL ON FUNCTION public.conciliar_exactas_lote(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deshacer_lote_conciliacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliar_exactas_lote(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_conciliacion(uuid) TO authenticated;