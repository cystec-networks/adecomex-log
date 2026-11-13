-- Conciliación automática tras cada importación de movimientos del banco.
ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS conciliado_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS revision_motivo text;

CREATE TABLE public.banco_lotes_automaticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_por uuid DEFAULT auth.uid(),
  archivo text,
  conciliados integer NOT NULL DEFAULT 0,
  creadas integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  deshecho_en timestamptz,
  deshecho_por uuid,
  deshechos integer
);
GRANT SELECT ON public.banco_lotes_automaticos TO authenticated;
GRANT ALL ON public.banco_lotes_automaticos TO service_role;
ALTER TABLE public.banco_lotes_automaticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banco_lotes_automaticos finanzas lectura" ON public.banco_lotes_automaticos FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]));

-- Deshacer individual: también quita la marca de conciliación automática y el motivo de revisión.
CREATE OR REPLACE FUNCTION public.deshacer_conciliacion_banco(p_movimiento uuid, p_anular_creada boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    motivo_diferencia = NULL, vinculado_movimiento_id = NULL, lote_conciliacion = NULL,
    conciliado_auto = false, revision_motivo = NULL
  WHERE id = m.id;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', m.id, 'CONCILIACION_DESHECHA', v_uid, jsonb_build_object(
    'tipo_anterior', m.conciliado_tipo, 'notas_anteriores', m.notas, 'entrada_creada', v_creada_sec,
    'entrada_anulada', v_anulada, 'motivo', nullif(trim(p_motivo), ''), 'lote', m.lote_conciliacion,
    'automatica', m.conciliado_auto));

  RETURN jsonb_build_object('anulada', CASE WHEN v_anulada THEN v_creada_sec END);
END $function$;

-- Beneficiario conocido del débito: cuenta destino con nombre (no compartida) o regla con beneficiario.
-- Devuelve NULL si es conocido; si no, el motivo de revisión.
CREATE OR REPLACE FUNCTION private.motivo_beneficiario_banco(p_descripcion text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cuenta text := substring(coalesce(p_descripcion, '') FROM 'IB a ([0-9]+)'); c record;
BEGIN
  IF v_cuenta IS NOT NULL THEN
    SELECT beneficiario, titulares INTO c FROM public.banco_cuentas_beneficiario
    WHERE activo AND ltrim(cuenta, '0') = ltrim(v_cuenta, '0') LIMIT 1;
    IF NOT FOUND OR coalesce(trim(c.beneficiario), '') = '' THEN RETURN 'Cuenta desconocida'; END IF;
    IF cardinality(c.titulares) >= 2 THEN RETURN 'Cuenta compartida'; END IF;
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.banco_reglas r WHERE r.activo AND coalesce(trim(r.beneficiario), '') <> ''
      AND position(upper(public.immutable_unaccent(trim(r.palabra_clave))) IN upper(public.immutable_unaccent(coalesce(p_descripcion, '')))) > 0) THEN
    RETURN NULL;
  END IF;
  RETURN 'Cuenta desconocida';
END $$;
REVOKE ALL ON FUNCTION private.motivo_beneficiario_banco(text) FROM PUBLIC, anon, authenticated;

-- Ejecuta la conciliación automática de una importación. p_items (en orden de fecha):
--   {movimiento_id, accion:'conciliar', origen_tipo, solicitud_id}  → concilia con la entrada exacta; si no tiene TF, recibe el siguiente.
--   {movimiento_id, accion:'crear', categoria, beneficiario, concepto} → crea la entrada (siguiente TF) y concilia.
-- p_revision: {movimiento_id, motivo} → quedan pendientes con su motivo.
-- Cada ítem se revalida en el servidor; si ya no cumple, pasa a revisión sin afectar a los demás.
CREATE OR REPLACE FUNCTION public.conciliar_automatico_importacion(p_items jsonb, p_revision jsonb DEFAULT '[]'::jsonb, p_archivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_inicio date; r record; m public.banco_movimientos%ROWTYPE; e record;
  v_motivo text; v_detalle jsonb := '[]'; v_conc int := 0; v_creadas int := 0; v_rev int := 0; v_total numeric := 0;
  v_asig jsonb; v_tf text; v_fuente text; v_res jsonb; v_n int;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  SELECT min(fecha) INTO v_inicio FROM public.vista_registro_diario WHERE origen = 'manual';
  PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));

  FOR r IN SELECT x->>'movimiento_id' AS movimiento_id, x->>'accion' AS accion, x->>'origen_tipo' AS origen_tipo,
      nullif(x->>'solicitud_id', '')::uuid AS solicitud_id, x->>'categoria' AS categoria, x->>'beneficiario' AS beneficiario,
      x->>'concepto' AS concepto
    FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS a(x, o) ORDER BY o
  LOOP
    v_motivo := NULL;
    BEGIN
      SELECT * INTO m FROM public.banco_movimientos WHERE id = r.movimiento_id::uuid FOR UPDATE;
      IF NOT FOUND OR m.tipo <> 'debito' OR m.conciliado THEN RAISE EXCEPTION 'El débito ya no está pendiente'; END IF;
      IF v_inicio IS NULL OR m.fecha < v_inicio THEN RAISE EXCEPTION 'Anterior al Diario'; END IF;
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

        v_tf := NULL; v_fuente := NULL;
        IF private.normalizar_tf(e.secuencia) IS NULL THEN
          v_asig := private.tf_para_entradas(jsonb_build_array(jsonb_build_object(
            'origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id, 'movimiento_id', m.id)));
          v_tf := v_asig->0->>'tf'; v_fuente := v_asig->0->>'fuente';
          IF v_tf IS NULL THEN RAISE EXCEPTION 'No se pudo asignar TF'; END IF;
          IF r.origen_tipo = 'transporte' THEN
            UPDATE public.solicitudes_pago_transporte SET numero_control = v_tf, tf_retroactivo = true, tf_excel = false WHERE id = r.solicitud_id;
            UPDATE public.transportes SET numero_control_pago = v_tf
            WHERE solicitud_pago_id = r.solicitud_id AND eliminado_en IS NULL
              AND (numero_control_pago IS NULL OR numero_control_pago = e.secuencia OR private.normalizar_tf(numero_control_pago) = v_tf);
          ELSE
            UPDATE public.solicitudes_pago_transferencia SET secuencia = v_tf, tf_retroactivo = true, tf_excel = false WHERE id = r.solicitud_id;
          END IF;
          PERFORM setval('public.solicitudes_pago_transferencia_seq',
            greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(v_tf FROM 4)::bigint));
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
          'tf_asignado', v_tf IS NOT NULL, 'beneficiario', e.beneficiario, 'fecha', m.fecha, 'monto', m.monto);

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
      v_total := v_total + m.monto;
    EXCEPTION WHEN OTHERS THEN
      v_motivo := CASE WHEN SQLERRM IN ('Cuenta desconocida', 'Cuenta compartida', 'Monto con diferencia', 'Varias coincidencias posibles', 'Anterior al Diario')
        THEN SQLERRM ELSE 'Revisar: ' || SQLERRM END;
      UPDATE public.banco_movimientos SET revision_motivo = v_motivo WHERE id = r.movimiento_id::uuid AND NOT conciliado;
      v_rev := v_rev + 1;
      v_detalle := v_detalle || jsonb_build_object('movimiento_id', r.movimiento_id, 'accion', 'revision', 'motivo', v_motivo);
    END;
  END LOOP;

  FOR r IN SELECT (x->>'movimiento_id')::uuid AS movimiento_id, coalesce(nullif(trim(x->>'motivo'), ''), 'Revisar') AS motivo
    FROM jsonb_array_elements(coalesce(p_revision, '[]'::jsonb)) x
  LOOP
    UPDATE public.banco_movimientos SET revision_motivo = r.motivo WHERE id = r.movimiento_id AND NOT conciliado AND tipo = 'debito';
    IF FOUND THEN
      v_rev := v_rev + 1;
      v_detalle := v_detalle || jsonb_build_object('movimiento_id', r.movimiento_id, 'accion', 'revision', 'motivo', r.motivo);
    END IF;
  END LOOP;

  INSERT INTO public.banco_lotes_automaticos(id, creado_por, archivo, conciliados, creadas, revision, total, detalle)
  VALUES (v_lote, v_uid, p_archivo, v_conc, v_creadas, v_rev, v_total, v_detalle);
  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', v_lote, 'LOTE_CONCILIACION_AUTOMATICA', v_uid, jsonb_build_object(
    'archivo', p_archivo, 'conciliados', v_conc, 'creadas', v_creadas, 'revision', v_rev, 'total', v_total));

  RETURN jsonb_build_object('lote', v_lote, 'conciliados', v_conc, 'creadas', v_creadas, 'revision', v_rev, 'total', v_total, 'detalle', v_detalle);
END $$;

-- Deshace un lote automático completo: cada débito vuelve a Pendiente y las entradas creadas se ANULAN (nunca se borran).
CREATE OR REPLACE FUNCTION public.deshacer_lote_automatico(p_lote uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int := 0; v_anuladas int := 0; r record; v_res jsonb; l record;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para deshacer conciliaciones';
  END IF;
  SELECT * INTO l FROM public.banco_lotes_automaticos WHERE id = p_lote FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;
  IF l.deshecho_en IS NOT NULL THEN RAISE EXCEPTION 'Este lote ya fue deshecho'; END IF;
  FOR r IN SELECT id FROM public.banco_movimientos
    WHERE lote_conciliacion = p_lote AND conciliado AND conciliado_auto ORDER BY fecha DESC, created_at DESC FOR UPDATE LOOP
    v_res := public.deshacer_conciliacion_banco(r.id, true, coalesce(nullif(trim(p_motivo), ''), 'Conciliación automática deshecha'));
    UPDATE public.banco_movimientos SET revision_motivo = 'Conciliación automática deshecha' WHERE id = r.id;
    v_n := v_n + 1;
    IF v_res->>'anulada' IS NOT NULL THEN v_anuladas := v_anuladas + 1; END IF;
  END LOOP;
  UPDATE public.banco_lotes_automaticos SET deshecho_en = now(), deshecho_por = v_uid, deshechos = v_n WHERE id = p_lote;
  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', p_lote, 'LOTE_CONCILIACION_AUTOMATICA_DESHECHO', v_uid,
    jsonb_build_object('deshechos', v_n, 'anuladas', v_anuladas, 'motivo', nullif(trim(p_motivo), '')));
  RETURN jsonb_build_object('deshechos', v_n, 'anuladas', v_anuladas);
END $$;

REVOKE ALL ON FUNCTION public.conciliar_automatico_importacion(jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deshacer_lote_automatico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliar_automatico_importacion(jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_automatico(uuid, text) TO authenticated;