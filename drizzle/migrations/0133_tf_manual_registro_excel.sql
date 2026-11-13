-- Marca «TF de registro anterior (Excel)»: TF indicado a mano al conciliar, tomado del registro previo.
ALTER TABLE public.solicitudes_pago_transporte ADD COLUMN IF NOT EXISTS tf_excel boolean NOT NULL DEFAULT false;
ALTER TABLE public.solicitudes_pago_transferencia ADD COLUMN IF NOT EXISTS tf_excel boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.vista_registro_diario WITH (security_invoker = true) AS
SELECT t.id,
  'transporte'::text AS origen_tipo,
  t.created_at::date AS fecha,
  t.numero_control AS secuencia,
  'Pago Transportes'::text AS categoria,
  COALESCE(tr.refs, ''::text) AS referencia,
  t.transportista_nombre AS beneficiario,
  COALESCE(t.descripcion, 'Pago de transporte'::text) AS concepto,
  t.monto,
  COALESCE(t.descuento_cxc, 0::numeric) AS descuento_cxc,
  round(COALESCE(
    CASE WHEN t.cantidad_viajes IS NOT NULL AND t.precio_viaje IS NOT NULL AND t.porcentaje_margen IS NOT NULL
      THEN t.cantidad_viajes::numeric * t.precio_viaje * (1::numeric - t.porcentaje_margen / 100::numeric)
      ELSE NULL::numeric END, t.monto) - COALESCE(t.descuento_cxc, 0::numeric), 2) AS neto,
  t.id AS solicitud_id,
  'manual'::text AS origen,
  'pagada'::text AS estado,
  bc.movimiento_id,
  m.referencia AS referencia_bancaria,
  m.fecha AS fecha_banco,
  bc.diferencia AS diferencia_banco,
  bc.motivo_diferencia,
  (bc.id IS NOT NULL) AS conciliado,
  false AS retroactiva,
  t.tf_retroactivo,
  t.tf_excel
FROM public.solicitudes_pago_transporte t
LEFT JOIN LATERAL (
  SELECT string_agg(x.numero_viaje, ', ' ORDER BY x.numero_viaje) AS refs
  FROM public.transportes x WHERE x.solicitud_pago_id = t.id AND x.eliminado_en IS NULL
) tr ON true
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transporte' AND bc.solicitud_id = t.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
UNION ALL
SELECT s.id,
  'transferencia'::text AS origen_tipo,
  s.fecha,
  s.secuencia,
  s.categoria,
  COALESCE(s.factura_compra, ''::text) AS referencia,
  s.beneficiario,
  s.concepto,
  s.monto,
  COALESCE(s.descuento_cxc, 0::numeric) AS descuento_cxc,
  round(s.monto - COALESCE(s.descuento_cxc, 0::numeric), 2) AS neto,
  s.id AS solicitud_id,
  s.origen,
  s.estado,
  bc.movimiento_id,
  m.referencia AS referencia_bancaria,
  m.fecha AS fecha_banco,
  bc.diferencia AS diferencia_banco,
  bc.motivo_diferencia,
  (bc.id IS NOT NULL) AS conciliado,
  s.retroactiva,
  s.tf_retroactivo,
  s.tf_excel
FROM public.solicitudes_pago_transferencia s
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transferencia' AND bc.solicitud_id = s.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
WHERE s.eliminado_en IS NULL AND s.estado <> 'anulada';
GRANT SELECT ON public.vista_registro_diario TO authenticated;

-- TF que recibiría cada entrada sin TF. Si la entrada trae «tf_manual» (TF del registro anterior en Excel),
-- se valida y se usa ese (fuente «manual»): formato TF, anterior al siguiente disponible, sin uso por otra entrada
-- ni por el número de pago de otro viaje, y no repetido en el lote. Si el campo viene vacío, igual que antes:
-- TF anotado en el viaje solo si encaja cronológicamente; si no, el siguiente disponible saltando colisiones.
-- Los TF manuales se reservan primero para que ningún número automático los tome.
CREATE OR REPLACE FUNCTION private.tf_para_entradas(p_entradas jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sec text; v_fecha date; v_ref date; v_ment text[]; v_tf text; v_fuente text; n bigint; v_sig_num bigint;
  v_usados text[] := '{}'; v_manuales text[] := '{}'; v_res jsonb := '[]'; v_cand text; v_ant record; v_sig record; v_encaja boolean;
  v_info jsonb; v_error text; v_aviso text; v_otro text;
BEGIN
  v_sig_num := substring(public.siguiente_tf() FROM 4)::bigint;
  n := v_sig_num;
  -- TF manuales válidos de formato: se reservan antes de calcular los automáticos.
  SELECT coalesce(array_agg(private.normalizar_tf(x->>'tf_manual')), '{}') INTO v_manuales
  FROM jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) x
  WHERE private.normalizar_tf(x->>'tf_manual') IS NOT NULL;

  FOR r IN SELECT (x->>'origen_tipo') AS origen_tipo, (x->>'solicitud_id')::uuid AS solicitud_id,
      nullif(x->>'movimiento_id', '')::uuid AS movimiento_id, nullif(trim(coalesce(x->>'tf_manual', '')), '') AS tf_manual
    FROM jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) WITH ORDINALITY AS a(x, o) ORDER BY o
  LOOP
    SELECT v.secuencia, v.fecha INTO v_sec, v_fecha FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
    IF NOT FOUND OR private.normalizar_tf(v_sec) IS NOT NULL THEN CONTINUE; END IF;
    v_ref := coalesce((SELECT fecha FROM public.banco_movimientos WHERE id = r.movimiento_id), v_fecha);
    v_tf := NULL; v_fuente := 'nuevo'; v_cand := NULL; v_info := NULL; v_error := NULL; v_aviso := NULL;

    IF r.tf_manual IS NOT NULL THEN
      v_fuente := 'manual';
      v_tf := private.normalizar_tf(r.tf_manual);
      IF v_tf IS NULL THEN
        v_error := 'Escribe un número TF válido (p. ej. TF-0012700).';
      ELSIF substring(v_tf FROM 4)::bigint >= v_sig_num THEN
        v_error := v_tf || ' no es de un registro anterior: el siguiente disponible es ' || public.siguiente_tf() || '.';
      ELSIF v_tf = ANY(v_usados) THEN
        v_error := v_tf || ' está repetido en otra fila de este lote.';
      ELSE
        SELECT coalesce(secuencia, '') || ' · ' || coalesce(beneficiario, '') INTO v_otro
        FROM public.solicitudes_pago_transferencia WHERE private.normalizar_tf(secuencia) = v_tf AND id <> r.solicitud_id LIMIT 1;
        IF v_otro IS NULL THEN
          SELECT coalesce(numero_control, '') || ' · ' || coalesce(transportista_nombre, '') INTO v_otro
          FROM public.solicitudes_pago_transporte WHERE private.normalizar_tf(numero_control) = v_tf AND id <> r.solicitud_id LIMIT 1;
        END IF;
        IF v_otro IS NULL THEN
          SELECT 'viaje ' || coalesce(numero_viaje, '') INTO v_otro FROM public.transportes
          WHERE private.normalizar_tf(numero_control_pago) = v_tf AND solicitud_pago_id IS DISTINCT FROM r.solicitud_id LIMIT 1;
        END IF;
        IF v_otro IS NOT NULL THEN
          v_error := v_tf || ' ya está en uso por otra entrada (' || v_otro || ').';
        ELSE
          SELECT string_agg(DISTINCT numero_viaje, ', ') INTO v_otro FROM public.transportes
          WHERE private.normalizar_tf(pago_referencia) = v_tf AND solicitud_pago_id IS DISTINCT FROM r.solicitud_id;
          IF v_otro IS NOT NULL THEN
            v_aviso := 'El viaje ' || v_otro || ' anota ' || v_tf || ' en «N° Ref. Pago» (campo no fiable); no bloquea.';
          END IF;
          IF EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_tf) THEN
            v_aviso := concat_ws(' ', v_aviso, 'Está en «Números TF sin uso»: se quitará de esa lista al conciliar.');
          END IF;
        END IF;
      END IF;
      IF v_error IS NULL THEN v_usados := v_usados || v_tf; END IF;
      v_res := v_res || jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id,
        'secuencia_actual', v_sec, 'tf', CASE WHEN v_error IS NULL THEN v_tf END, 'fuente', 'manual', 'viaje', NULL,
        'tf_manual', r.tf_manual, 'error', v_error, 'aviso', v_aviso);
      CONTINUE;
    END IF;

    IF r.origen_tipo = 'transporte' THEN
      SELECT array_agg(DISTINCT t) INTO v_ment FROM (
        SELECT private.normalizar_tf(x.pago_referencia) AS t FROM public.transportes x WHERE x.solicitud_pago_id = r.solicitud_id AND x.eliminado_en IS NULL
        UNION ALL
        SELECT private.normalizar_tf(x.numero_control_pago) FROM public.transportes x WHERE x.solicitud_pago_id = r.solicitud_id AND x.eliminado_en IS NULL
      ) q WHERE t IS NOT NULL;
      IF cardinality(v_ment) = 1 THEN
        v_cand := v_ment[1];
        WITH g AS (
          SELECT substring(secuencia FROM 4)::bigint AS num, secuencia AS tf, fecha FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
          UNION ALL
          SELECT substring(numero_control FROM 4)::bigint, numero_control, created_at::date FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
        ) SELECT tf, fecha INTO v_ant FROM g WHERE num < substring(v_cand FROM 4)::bigint ORDER BY num DESC LIMIT 1;
        WITH g AS (
          SELECT substring(secuencia FROM 4)::bigint AS num, secuencia AS tf, fecha FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
          UNION ALL
          SELECT substring(numero_control FROM 4)::bigint, numero_control, created_at::date FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
        ) SELECT tf, fecha INTO v_sig FROM g WHERE num > substring(v_cand FROM 4)::bigint ORDER BY num ASC LIMIT 1;
        v_encaja := v_ant.tf IS NOT NULL AND v_sig.tf IS NOT NULL AND v_ant.fecha <= v_ref AND v_ref <= v_sig.fecha;
        v_info := jsonb_build_object('mencionado', v_cand, 'fecha_referencia', v_ref, 'encaja', v_encaja,
          'anterior', CASE WHEN v_ant.tf IS NOT NULL THEN jsonb_build_object('tf', v_ant.tf, 'fecha', v_ant.fecha) END,
          'siguiente', CASE WHEN v_sig.tf IS NOT NULL THEN jsonb_build_object('tf', v_sig.tf, 'fecha', v_sig.fecha) END);
        IF v_encaja AND private.tf_libre(v_cand, r.solicitud_id) AND NOT v_cand = ANY(v_usados) AND NOT v_cand = ANY(v_manuales)
           AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_cand) THEN
          v_tf := v_cand; v_fuente := 'viaje';
        END IF;
      END IF;
    END IF;
    IF v_tf IS NULL THEN
      LOOP
        v_tf := 'TF-' || lpad(n::text, 7, '0');
        EXIT WHEN private.tf_libre(v_tf) AND NOT v_tf = ANY(v_usados) AND NOT v_tf = ANY(v_manuales)
          AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_tf);
        n := n + 1;
      END LOOP;
      n := n + 1;
    END IF;
    v_usados := v_usados || v_tf;
    v_res := v_res || jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id,
      'secuencia_actual', v_sec, 'tf', v_tf, 'fuente', v_fuente, 'viaje', v_info);
  END LOOP;
  RETURN v_res;
END $$;

-- Lote de sugerencias exactas: los TF manuales (registro anterior en Excel) se validan igual que en la vista previa,
-- quedan marcados «TF de registro anterior (Excel)» y no mueven la secuencia; los automáticos, «TF asignado retroactivamente».
CREATE OR REPLACE FUNCTION public.conciliar_exactas_lote(p_pares jsonb, p_asignar_tf boolean DEFAULT false, p_tf_previstos jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_n int; r record; a record;
  m public.banco_movimientos%ROWTYPE; e record; v_total numeric := 0; v_asig jsonb := '[]'; v_confirmados jsonb := '[]'; v_err text;
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
      IF private.clave_nombre(r.beneficiario_confirmado) <> private.clave_nombre(e.beneficiario) THEN
        RAISE EXCEPTION 'El beneficiario elegido para el débito del % (%) no es el de la entrada (%).', to_char(m.fecha, 'DD/MM/YYYY'), r.beneficiario_confirmado, e.beneficiario;
      END IF;
      v_confirmados := v_confirmados || jsonb_build_object('movimiento_id', m.id, 'cuenta', substring(m.descripcion FROM 'IB a ([0-9]+)'), 'beneficiario', e.beneficiario);
    END IF;
  END LOOP;

  IF p_asignar_tf THEN
    PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));
    v_asig := private.tf_para_entradas((SELECT jsonb_agg(jsonb_build_object('origen_tipo', x->>'origen_tipo', 'solicitud_id', x->>'solicitud_id',
        'movimiento_id', x->>'movimiento_id', 'tf_manual', x->>'tf_manual') ORDER BY o)
      FROM jsonb_array_elements(p_pares) WITH ORDINALITY AS q(x, o)));
    SELECT string_agg(x->>'error', ' ') INTO v_err FROM jsonb_array_elements(v_asig) x WHERE x->>'error' IS NOT NULL;
    IF v_err IS NOT NULL THEN
      RAISE EXCEPTION 'No se concilió ninguno: %', v_err;
    END IF;
    IF EXISTS (
      SELECT 1 FROM (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(v_asig) x) a1
      FULL JOIN (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(coalesce(p_tf_previstos, '[]'::jsonb)) x) b1 ON a1.s = b1.s
      WHERE a1.s IS NULL OR b1.s IS NULL OR a1.tf IS DISTINCT FROM b1.tf
    ) THEN
      RAISE EXCEPTION 'Los números TF cambiaron mientras revisabas. No se concilió ninguno ni se usó ningún número; revisa la nueva vista previa.';
    END IF;
    FOR a IN SELECT * FROM jsonb_to_recordset(v_asig) AS y(origen_tipo text, solicitud_id uuid, secuencia_actual text, tf text, fuente text, viaje jsonb, tf_manual text, aviso text) LOOP
      IF a.origen_tipo = 'transporte' THEN
        UPDATE public.solicitudes_pago_transporte
        SET numero_control = a.tf, tf_retroactivo = (a.fuente <> 'manual'), tf_excel = (a.fuente = 'manual')
        WHERE id = a.solicitud_id;
        UPDATE public.transportes SET numero_control_pago = a.tf
        WHERE solicitud_pago_id = a.solicitud_id AND eliminado_en IS NULL
          AND (numero_control_pago IS NULL OR numero_control_pago = a.secuencia_actual OR private.normalizar_tf(numero_control_pago) = a.tf);
      ELSE
        UPDATE public.solicitudes_pago_transferencia
        SET secuencia = a.tf, tf_retroactivo = (a.fuente <> 'manual'), tf_excel = (a.fuente = 'manual')
        WHERE id = a.solicitud_id;
      END IF;
      IF a.fuente = 'manual' THEN
        DELETE FROM public.tf_sin_uso_notas WHERE secuencia = a.tf;
      ELSE
        PERFORM setval('public.solicitudes_pago_transferencia_seq',
          greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(a.tf FROM 4)::bigint));
      END IF;
      INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
      VALUES (CASE WHEN a.origen_tipo = 'transporte' THEN 'solicitudes_pago_transporte' ELSE 'solicitudes_pago_transferencia' END,
        a.solicitud_id, 'TF_ASIGNADO_AL_CONCILIAR', v_uid, jsonb_build_object(
          'numero_anterior', a.secuencia_actual, 'tf', a.tf, 'fuente', a.fuente, 'viaje', a.viaje, 'lote', v_lote,
          'retroactivo', a.fuente <> 'manual', 'registro_anterior_excel', a.fuente = 'manual', 'tf_escrito', a.tf_manual, 'aviso', a.aviso));
    END LOOP;
  END IF;

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
