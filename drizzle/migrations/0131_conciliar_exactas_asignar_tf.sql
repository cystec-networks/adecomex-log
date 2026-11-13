-- Número TF normalizado (TF-0012755) a partir de textos como "TF0012755", "TF-12720"; NULL si no es un TF.
CREATE OR REPLACE FUNCTION private.normalizar_tf(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN upper(trim(coalesce(p, ''))) ~ '^TF-?[0-9]+$'
    THEN 'TF-' || lpad(ltrim(regexp_replace(p, '[^0-9]', '', 'g'), '0'), 7, '0') END
$$;

-- Un TF está libre si ninguna solicitud lo usa, ningún viaje lo menciona y no está en la lista «Números TF sin uso».
CREATE OR REPLACE FUNCTION private.tf_libre(p_tf text, p_excepto_solicitud uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transferencia WHERE private.normalizar_tf(secuencia) = p_tf)
    AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transporte WHERE private.normalizar_tf(numero_control) = p_tf)
    AND NOT EXISTS (SELECT 1 FROM public.transportes
      WHERE (private.normalizar_tf(numero_control_pago) = p_tf OR private.normalizar_tf(pago_referencia) = p_tf)
        AND solicitud_pago_id IS DISTINCT FROM p_excepto_solicitud)
$$;

-- TF que recibiría cada entrada sin TF, en el orden recibido. Si los viajes de un pago de transporte ya anotan
-- un único TF libre, se usa ese (fuente «viaje»); si no, el siguiente disponible (último guardado + 1, saltando colisiones).
CREATE OR REPLACE FUNCTION private.tf_para_entradas(p_entradas jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sec text; v_ment text[]; v_tf text; v_fuente text; n bigint; v_usados text[] := '{}'; v_res jsonb := '[]';
BEGIN
  n := substring(public.siguiente_tf() FROM 4)::bigint;
  FOR r IN SELECT (x->>'origen_tipo') AS origen_tipo, (x->>'solicitud_id')::uuid AS solicitud_id
    FROM jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) WITH ORDINALITY AS a(x, o) ORDER BY o
  LOOP
    SELECT v.secuencia INTO v_sec FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
    IF NOT FOUND OR private.normalizar_tf(v_sec) IS NOT NULL THEN CONTINUE; END IF;
    v_tf := NULL; v_fuente := 'nuevo';
    IF r.origen_tipo = 'transporte' THEN
      SELECT array_agg(DISTINCT t) INTO v_ment FROM (
        SELECT private.normalizar_tf(x.pago_referencia) AS t FROM public.transportes x WHERE x.solicitud_pago_id = r.solicitud_id AND x.eliminado_en IS NULL
        UNION ALL
        SELECT private.normalizar_tf(x.numero_control_pago) FROM public.transportes x WHERE x.solicitud_pago_id = r.solicitud_id AND x.eliminado_en IS NULL
      ) q WHERE t IS NOT NULL;
      IF cardinality(v_ment) = 1 AND private.tf_libre(v_ment[1], r.solicitud_id) AND NOT v_ment[1] = ANY(v_usados)
         AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_ment[1]) THEN
        v_tf := v_ment[1]; v_fuente := 'viaje';
      END IF;
    END IF;
    IF v_tf IS NULL THEN
      LOOP
        v_tf := 'TF-' || lpad(n::text, 7, '0');
        EXIT WHEN private.tf_libre(v_tf) AND NOT v_tf = ANY(v_usados)
          AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_tf);
        n := n + 1;
      END LOOP;
      n := n + 1;
    END IF;
    v_usados := v_usados || v_tf;
    v_res := v_res || jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id,
      'secuencia_actual', v_sec, 'tf', v_tf, 'fuente', v_fuente);
  END LOOP;
  RETURN v_res;
END $$;

-- Vista previa (no consume números) de los TF para las entradas sin TF del lote de sugerencias exactas.
CREATE OR REPLACE FUNCTION public.previsualizar_tf_exactas(p_entradas jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la secuencia TF';
  END IF;
  IF jsonb_array_length(coalesce(p_entradas, '[]'::jsonb)) > 200 THEN RAISE EXCEPTION 'Máximo 200 entradas'; END IF;
  RETURN private.tf_para_entradas(p_entradas);
END $$;

DROP FUNCTION IF EXISTS public.conciliar_exactas_lote(jsonb);

-- Lote de sugerencias exactas (todo o nada). Con p_asignar_tf, las entradas sin TF reciben su número antes de
-- conciliar, solo si coincide con la vista previa (p_tf_previstos); si cambió, no se concilia ni consume nada.
-- beneficiario_confirmado (cuentas con dos beneficiarios) debe ser el de la entrada.
CREATE FUNCTION public.conciliar_exactas_lote(p_pares jsonb, p_asignar_tf boolean DEFAULT false, p_tf_previstos jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_n int; r record; a record;
  m public.banco_movimientos%ROWTYPE; e record; v_total numeric := 0; v_asig jsonb := '[]'; v_confirmados jsonb := '[]';
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

  -- 1. Validar todo antes de escribir nada
  FOR r IN SELECT * FROM jsonb_to_recordset(p_pares) AS x(movimiento_id uuid, origen_tipo text, solicitud_id uuid, beneficiario_confirmado text) LOOP
    SELECT * INTO m FROM public.banco_movimientos WHERE id = r.movimiento_id FOR UPDATE;
    IF NOT FOUND OR m.tipo <> 'debito' OR m.conciliado THEN
      RAISE EXCEPTION 'Un débito ya no está pendiente. Vuelve a abrir la vista previa.';
    END IF;
    SELECT v.secuencia, v.neto, v.fecha, v.conciliado, v.estado, v.beneficiario INTO e
    FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
    IF NOT FOUND OR coalesce(e.conciliado, false) OR e.estado = 'anulada' THEN
      RAISE EXCEPTION 'La entrada del débito del % por RD$ % ya no está disponible. Vuelve a abrir la vista previa.', to_char(m.fecha, 'DD/MM/YYYY'), m.monto;
    END IF;
    IF round(m.monto, 2) <> round(e.neto, 2) OR abs(m.fecha - e.fecha) > 3 THEN
      RAISE EXCEPTION 'La entrada % ya no coincide exacta con el débito del % (monto o fecha). Vuelve a abrir la vista previa.', e.secuencia, to_char(m.fecha, 'DD/MM/YYYY');
    END IF;
    IF r.beneficiario_confirmado IS NOT NULL THEN
      IF upper(regexp_replace(r.beneficiario_confirmado, '[^A-Za-z]', '', 'g')) <> upper(regexp_replace(e.beneficiario, '[^A-Za-z]', '', 'g')) THEN
        RAISE EXCEPTION 'El beneficiario elegido para el débito del % (%) no es el de la entrada (%).', to_char(m.fecha, 'DD/MM/YYYY'), r.beneficiario_confirmado, e.beneficiario;
      END IF;
      v_confirmados := v_confirmados || jsonb_build_object('movimiento_id', m.id, 'cuenta', substring(m.descripcion FROM 'IB a ([0-9]+)'), 'beneficiario', e.beneficiario);
    END IF;
  END LOOP;

  -- 2. Asignar TF a las entradas sin número (mismo cálculo que la vista previa)
  IF p_asignar_tf THEN
    PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));
    v_asig := private.tf_para_entradas((SELECT jsonb_agg(jsonb_build_object('origen_tipo', x->>'origen_tipo', 'solicitud_id', x->>'solicitud_id') ORDER BY o)
      FROM jsonb_array_elements(p_pares) WITH ORDINALITY AS q(x, o)));
    IF EXISTS (
      SELECT 1 FROM (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(v_asig) x) a1
      FULL JOIN (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(coalesce(p_tf_previstos, '[]'::jsonb)) x) b1 ON a1.s = b1.s
      WHERE a1.s IS NULL OR b1.s IS NULL OR a1.tf IS DISTINCT FROM b1.tf
    ) THEN
      RAISE EXCEPTION 'Los números TF cambiaron mientras revisabas. No se concilió ninguno ni se usó ningún número; revisa la nueva vista previa.';
    END IF;
    FOR a IN SELECT * FROM jsonb_to_recordset(v_asig) AS y(origen_tipo text, solicitud_id uuid, secuencia_actual text, tf text, fuente text) LOOP
      IF a.origen_tipo = 'transporte' THEN
        UPDATE public.solicitudes_pago_transporte SET numero_control = a.tf WHERE id = a.solicitud_id;
        UPDATE public.transportes SET numero_control_pago = a.tf
        WHERE solicitud_pago_id = a.solicitud_id AND eliminado_en IS NULL
          AND (numero_control_pago IS NULL OR numero_control_pago = a.secuencia_actual OR private.normalizar_tf(numero_control_pago) = a.tf);
      ELSE
        UPDATE public.solicitudes_pago_transferencia SET secuencia = a.tf WHERE id = a.solicitud_id;
      END IF;
      PERFORM setval('public.solicitudes_pago_transferencia_seq',
        greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(a.tf FROM 4)::bigint));
      INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
      VALUES (CASE WHEN a.origen_tipo = 'transporte' THEN 'solicitudes_pago_transporte' ELSE 'solicitudes_pago_transferencia' END,
        a.solicitud_id, 'TF_ASIGNADO_AL_CONCILIAR', v_uid, jsonb_build_object(
          'numero_anterior', a.secuencia_actual, 'tf', a.tf, 'fuente', a.fuente, 'lote', v_lote));
    END LOOP;
  END IF;

  -- 3. Conciliar uno a uno
  FOR r IN SELECT * FROM jsonb_to_recordset(p_pares) AS x(movimiento_id uuid, origen_tipo text, solicitud_id uuid) LOOP
    SELECT * INTO m FROM public.banco_movimientos WHERE id = r.movimiento_id;
    PERFORM public.conciliar_movimiento_diario(m.id,
      jsonb_build_array(jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id)), NULL);
    UPDATE public.banco_movimientos SET lote_conciliacion = v_lote WHERE id = m.id;
    v_total := v_total + m.monto;
  END LOOP;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', v_lote, 'LOTE_SUGERENCIAS_EXACTAS', v_uid,
    jsonb_build_object('cantidad', v_n, 'total', v_total, 'tf_asignados', v_asig, 'beneficiarios_confirmados', v_confirmados));

  RETURN jsonb_build_object('lote', v_lote, 'cantidad', v_n, 'total', v_total, 'tf_asignados', v_asig);
END $function$;

REVOKE ALL ON FUNCTION private.normalizar_tf(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tf_libre(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tf_para_entradas(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.previsualizar_tf_exactas(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliar_exactas_lote(jsonb, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_tf_exactas(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_exactas_lote(jsonb, boolean, jsonb) TO authenticated;