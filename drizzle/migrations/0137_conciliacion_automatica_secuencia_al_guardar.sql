-- La secuencia TF solo se mueve una vez al final, cuando el lote se guarda: un ítem fallido, una vista previa
-- distinta o una simulación nunca dejan la secuencia adelantada (setval no se deshace con la transacción).
CREATE OR REPLACE FUNCTION public.conciliar_automatico_importacion(
  p_items jsonb, p_revision jsonb DEFAULT '[]'::jsonb, p_archivo text DEFAULT NULL,
  p_simular boolean DEFAULT false, p_origen text DEFAULT 'importacion', p_previsto jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_inicio date; r record; m public.banco_movimientos%ROWTYPE; e record;
  v_motivo text; v_detalle jsonb := '[]'; v_conc int := 0; v_creadas int := 0; v_rev int := 0; v_noap int := 0; v_com int := 0; v_total numeric := 0;
  v_asig jsonb; v_tf text; v_fuente text; v_res jsonb; v_n int; v_pago uuid; p record; v_viajes jsonb; v_resultado jsonb; v_max bigint;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF p_origen NOT IN ('importacion', 'pendientes') THEN RAISE EXCEPTION 'Origen no válido'; END IF;
  BEGIN
    PERFORM set_config('adecomex.simulacion_tf', 'on', true);
    SELECT min(fecha) INTO v_inicio FROM public.vista_registro_diario WHERE origen = 'manual';
    PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));

    FOR r IN SELECT x->>'movimiento_id' AS movimiento_id, x->>'accion' AS accion, x->>'origen_tipo' AS origen_tipo,
        nullif(x->>'solicitud_id', '')::uuid AS solicitud_id, x->>'categoria' AS categoria, x->>'beneficiario' AS beneficiario,
        x->>'concepto' AS concepto, nullif(x->>'pago_id', '')::uuid AS pago_id
      FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS a(x, o) ORDER BY o
    LOOP
      v_motivo := NULL;
      BEGIN
        SELECT * INTO m FROM public.banco_movimientos WHERE id = r.movimiento_id::uuid FOR UPDATE;
        IF NOT FOUND OR m.tipo <> 'debito' OR m.conciliado THEN RAISE EXCEPTION 'El débito ya no está pendiente'; END IF;

        IF r.accion = 'no_aplica' THEN
          IF v_inicio IS NULL OR m.fecha >= v_inicio THEN RAISE EXCEPTION 'Ya no es anterior al Diario'; END IF;
          UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'ignorado', conciliado_id = NULL,
            conciliado_por = v_uid, conciliado_en = now(), notas = 'No aplica (anterior al Diario)',
            lote_conciliacion = v_lote, conciliado_auto = true, revision_motivo = NULL
          WHERE id = m.id;
          INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
          VALUES ('banco_movimientos', m.id, 'MOVIMIENTO_IGNORADO', v_uid, jsonb_build_object('nota', 'No aplica (anterior al Diario)',
            'lote_automatico', v_lote, 'inicio_diario', v_inicio, 'monto', m.monto, 'referencia_bancaria', m.referencia, 'fecha_banco', m.fecha));
          v_noap := v_noap + 1;
          v_detalle := v_detalle || jsonb_build_object('movimiento_id', m.id, 'accion', 'no_aplica', 'fecha', m.fecha, 'monto', m.monto);

        ELSE
          IF v_inicio IS NULL OR m.fecha < v_inicio THEN RAISE EXCEPTION 'Anterior al Diario'; END IF;

          IF r.accion = 'comision' THEN
            IF coalesce(m.descripcion, '') !~* '\mCOM\M' OR ltrim(coalesce(m.referencia, ''), '0') = '' THEN
              RAISE EXCEPTION 'Comisión sin pago del mismo día';
            END IF;
            SELECT count(*), (array_agg(x.id))[1] INTO v_n, v_pago FROM public.banco_movimientos x
            WHERE x.id <> m.id AND x.tipo = 'debito' AND x.fecha = m.fecha
              AND ltrim(coalesce(x.referencia, ''), '0') = ltrim(m.referencia, '0') AND coalesce(x.descripcion, '') !~* '\mCOM\M';
            IF v_n <> 1 OR v_pago IS DISTINCT FROM r.pago_id THEN RAISE EXCEPTION 'Comisión sin pago del mismo día'; END IF;
            SELECT descripcion, monto INTO p FROM public.banco_movimientos WHERE id = v_pago;
            UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'comision', conciliado_id = NULL,
              vinculado_movimiento_id = v_pago, conciliado_por = v_uid, conciliado_en = now(),
              notas = 'Comisión del pago ' || coalesce(p.descripcion, '') || ' (' || to_char(p.monto, 'FM999,999,990.00') || ')',
              lote_conciliacion = v_lote, conciliado_auto = true, revision_motivo = NULL
            WHERE id = m.id;
            INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
            VALUES ('banco_movimientos', m.id, 'COMISION_VINCULADA', v_uid, jsonb_build_object('vinculado', v_pago,
              'lote_automatico', v_lote, 'monto', m.monto, 'referencia_bancaria', m.referencia, 'fecha_banco', m.fecha));
            v_com := v_com + 1;
            v_detalle := v_detalle || jsonb_build_object('movimiento_id', m.id, 'accion', 'comision', 'pago_id', v_pago,
              'pago', coalesce(p.descripcion, ''), 'fecha', m.fecha, 'monto', m.monto);

          ELSE
            v_motivo := private.motivo_beneficiario_banco(m.descripcion);
            IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo; END IF;

            IF r.accion = 'conciliar' THEN
              SELECT v.secuencia, v.neto, v.fecha, v.conciliado, v.estado, v.beneficiario INTO e
              FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
              IF NOT FOUND OR coalesce(e.conciliado, false) OR e.estado = 'anulada' THEN RAISE EXCEPTION 'Varias coincidencias posibles'; END IF;
              IF round(m.monto, 2) <> round(e.neto, 2) OR abs(m.fecha - e.fecha) > 3 THEN RAISE EXCEPTION 'Monto con diferencia'; END IF;
              SELECT count(*) INTO v_n FROM public.vista_registro_diario v
              WHERE NOT coalesce(v.conciliado, false) AND v.estado <> 'anulada' AND round(v.neto, 2) = round(m.monto, 2)
                AND abs(v.fecha - m.fecha) <= 3 AND private.clave_nombre(v.beneficiario) = private.clave_nombre(e.beneficiario);
              IF v_n <> 1 THEN RAISE EXCEPTION 'Varias coincidencias posibles'; END IF;

              v_tf := NULL; v_fuente := NULL; v_viajes := NULL;
              IF private.normalizar_tf(e.secuencia) IS NULL THEN
                v_asig := private.tf_para_entradas(jsonb_build_array(jsonb_build_object(
                  'origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id, 'movimiento_id', m.id)));
                v_tf := v_asig->0->>'tf'; v_fuente := v_asig->0->>'fuente';
                IF v_tf IS NULL THEN RAISE EXCEPTION 'No se pudo asignar TF'; END IF;
                IF r.origen_tipo = 'transporte' THEN
                  SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'numero_control_pago', t.numero_control_pago)), '[]') INTO v_viajes
                  FROM public.transportes t
                  WHERE t.solicitud_pago_id = r.solicitud_id AND t.eliminado_en IS NULL
                    AND (t.numero_control_pago IS NULL OR t.numero_control_pago = e.secuencia OR private.normalizar_tf(t.numero_control_pago) = v_tf);
                  UPDATE public.solicitudes_pago_transporte SET numero_control = v_tf, tf_retroactivo = true, tf_excel = false WHERE id = r.solicitud_id;
                  UPDATE public.transportes SET numero_control_pago = v_tf
                  WHERE solicitud_pago_id = r.solicitud_id AND eliminado_en IS NULL
                    AND (numero_control_pago IS NULL OR numero_control_pago = e.secuencia OR private.normalizar_tf(numero_control_pago) = v_tf);
                ELSE
                  UPDATE public.solicitudes_pago_transferencia SET secuencia = v_tf, tf_retroactivo = true, tf_excel = false WHERE id = r.solicitud_id;
                END IF;
                INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
                VALUES (CASE WHEN r.origen_tipo = 'transporte' THEN 'solicitudes_pago_transporte' ELSE 'solicitudes_pago_transferencia' END,
                  r.solicitud_id, 'TF_ASIGNADO_AL_CONCILIAR', v_uid, jsonb_build_object('numero_anterior', e.secuencia, 'tf', v_tf,
                  'fuente', v_fuente, 'viaje', v_asig->0->'viaje', 'lote_automatico', v_lote, 'retroactivo', true));
              END IF;

              PERFORM public.conciliar_movimiento_diario(m.id,
                jsonb_build_array(jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id)), NULL);
              UPDATE public.banco_movimientos SET lote_conciliacion = v_lote, conciliado_auto = true, revision_motivo = NULL,
                notas = coalesce(v_tf, e.secuencia) || ' · conciliado automáticamente'
              WHERE id = m.id;
              v_conc := v_conc + 1;
              v_detalle := v_detalle || jsonb_build_object('movimiento_id', m.id, 'accion', 'conciliar', 'secuencia', coalesce(v_tf, e.secuencia),
                'tf_asignado', v_tf IS NOT NULL, 'fuente_tf', v_fuente, 'numero_anterior', e.secuencia, 'origen_tipo', r.origen_tipo,
                'solicitud_id', r.solicitud_id, 'viajes_anteriores', v_viajes, 'beneficiario', e.beneficiario, 'fecha', m.fecha, 'monto', m.monto);

            ELSIF r.accion = 'crear' THEN
              IF coalesce(trim(r.beneficiario), '') = '' THEN RAISE EXCEPTION 'Cuenta desconocida'; END IF;
              IF EXISTS (SELECT 1 FROM public.vista_registro_diario v
                WHERE NOT coalesce(v.conciliado, false) AND v.estado <> 'anulada' AND abs(v.fecha - m.fecha) <= 3
                  AND private.clave_nombre(v.beneficiario) = private.clave_nombre(r.beneficiario)) THEN
                RAISE EXCEPTION 'Monto con diferencia';
              END IF;
              v_res := public.crear_entrada_diario_desde_banco(m.id, m.fecha, r.categoria, r.beneficiario, r.concepto, NULL);
              UPDATE public.banco_movimientos SET lote_conciliacion = v_lote, conciliado_auto = true, revision_motivo = NULL,
                notas = 'Entrada ' || (v_res->>'secuencia') || ' creada automáticamente desde banco'
              WHERE id = m.id;
              v_creadas := v_creadas + 1;
              v_detalle := v_detalle || jsonb_build_object('movimiento_id', m.id, 'accion', 'crear', 'secuencia', v_res->>'secuencia',
                'tf_asignado', true, 'beneficiario', trim(r.beneficiario), 'categoria', trim(r.categoria), 'fecha', m.fecha, 'monto', m.monto);
            ELSE
              RAISE EXCEPTION 'Acción desconocida';
            END IF;
          END IF;
        END IF;
        v_total := v_total + m.monto;
      EXCEPTION WHEN OTHERS THEN
        v_motivo := CASE WHEN SQLERRM IN ('Cuenta desconocida', 'Cuenta compartida', 'Monto con diferencia', 'Varias coincidencias posibles',
            'Anterior al Diario', 'Comisión sin pago del mismo día')
          THEN SQLERRM ELSE 'Revisar: ' || SQLERRM END;
        UPDATE public.banco_movimientos SET revision_motivo = v_motivo WHERE id = r.movimiento_id::uuid AND NOT conciliado;
        v_rev := v_rev + 1;
        v_detalle := v_detalle || jsonb_build_object('movimiento_id', r.movimiento_id, 'accion', 'revision', 'motivo', v_motivo,
          'monto', (SELECT monto FROM public.banco_movimientos WHERE id = r.movimiento_id::uuid),
          'fecha', (SELECT fecha FROM public.banco_movimientos WHERE id = r.movimiento_id::uuid));
      END;
    END LOOP;

    FOR r IN SELECT (x->>'movimiento_id')::uuid AS movimiento_id, coalesce(nullif(trim(x->>'motivo'), ''), 'Revisar') AS motivo
      FROM jsonb_array_elements(coalesce(p_revision, '[]'::jsonb)) x
    LOOP
      UPDATE public.banco_movimientos SET revision_motivo = r.motivo WHERE id = r.movimiento_id AND NOT conciliado AND tipo = 'debito'
      RETURNING * INTO m;
      IF FOUND THEN
        v_rev := v_rev + 1;
        v_detalle := v_detalle || jsonb_build_object('movimiento_id', r.movimiento_id, 'accion', 'revision', 'motivo', r.motivo,
          'monto', m.monto, 'fecha', m.fecha);
      END IF;
    END LOOP;

    IF NOT p_simular AND p_previsto IS NOT NULL AND EXISTS (
      SELECT 1 FROM (SELECT d->>'movimiento_id' AS id, d->>'accion' AS accion, d->>'secuencia' AS sec FROM jsonb_array_elements(v_detalle) d) a1
      FULL JOIN (SELECT d->>'movimiento_id' AS id, d->>'accion' AS accion, d->>'secuencia' AS sec FROM jsonb_array_elements(p_previsto) d) b1 ON a1.id = b1.id
      WHERE a1.id IS NULL OR b1.id IS NULL OR a1.accion IS DISTINCT FROM b1.accion OR a1.sec IS DISTINCT FROM b1.sec
    ) THEN
      RAISE EXCEPTION 'Los datos cambiaron desde la vista previa (algún débito o número TF ya no es igual). No se guardó nada; vuelve a calcular la vista previa.';
    END IF;

    IF NOT p_simular THEN
      PERFORM set_config('adecomex.simulacion_tf', 'off', true);
      SELECT max(substring(d->>'secuencia' FROM 4)::bigint) INTO v_max FROM jsonb_array_elements(v_detalle) d
      WHERE d->>'accion' IN ('conciliar', 'crear') AND coalesce((d->>'tf_asignado')::boolean, false) AND d->>'secuencia' ~ '^TF-[0-9]+$';
      IF v_max IS NOT NULL THEN
        PERFORM setval('public.solicitudes_pago_transferencia_seq', greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), v_max));
      END IF;
    END IF;

    INSERT INTO public.banco_lotes_automaticos(id, creado_por, archivo, conciliados, creadas, revision, total, detalle, no_aplica, comisiones, origen)
    VALUES (v_lote, v_uid, p_archivo, v_conc, v_creadas, v_rev, v_total, v_detalle, v_noap, v_com, p_origen);
    INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('banco_lote_conciliacion', v_lote, 'LOTE_CONCILIACION_AUTOMATICA', v_uid, jsonb_build_object(
      'archivo', p_archivo, 'origen', p_origen, 'conciliados', v_conc, 'creadas', v_creadas, 'no_aplica', v_noap,
      'comisiones', v_com, 'revision', v_rev, 'total', v_total));

    v_resultado := jsonb_build_object('lote', v_lote, 'conciliados', v_conc, 'creadas', v_creadas, 'no_aplica', v_noap,
      'comisiones', v_com, 'revision', v_rev, 'total', v_total, 'detalle', v_detalle, 'simulado', p_simular);
    IF p_simular THEN RAISE EXCEPTION 'simulacion' USING ERRCODE = 'P0901'; END IF;
  EXCEPTION WHEN SQLSTATE 'P0901' THEN
    RETURN v_resultado || jsonb_build_object('lote', NULL, 'simulado', true);
  END;
  RETURN v_resultado;
END $$;