-- Cuentas con varios titulares (cuenta compartida)
ALTER TABLE public.banco_cuentas_beneficiario ADD COLUMN IF NOT EXISTS titulares text[] NOT NULL DEFAULT '{}';

-- Marca «TF asignado retroactivamente» (TF puesto al conciliar, no nacido con su número en orden)
ALTER TABLE public.solicitudes_pago_transporte ADD COLUMN IF NOT EXISTS tf_retroactivo boolean NOT NULL DEFAULT false;
ALTER TABLE public.solicitudes_pago_transferencia ADD COLUMN IF NOT EXISTS tf_retroactivo boolean NOT NULL DEFAULT false;

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
  t.tf_retroactivo
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
  s.tf_retroactivo
FROM public.solicitudes_pago_transferencia s
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transferencia' AND bc.solicitud_id = s.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
WHERE s.eliminado_en IS NULL AND s.estado <> 'anulada';
GRANT SELECT ON public.vista_registro_diario TO authenticated;

-- Nombre comparable (sin acentos, solo letras, mayúsculas)
CREATE OR REPLACE FUNCTION private.clave_nombre(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(regexp_replace(public.immutable_unaccent(coalesce(p, '')), '[^A-Za-z]', '', 'g'))
$$;

-- TF que recibiría cada entrada sin TF. Un TF anotado en los viajes solo se usa si encaja cronológicamente:
-- existen el TF guardado anterior y el siguiente, y la fecha del débito (o de la entrada) queda entre sus fechas.
-- Si no, el siguiente disponible (último guardado + 1, saltando colisiones).
CREATE OR REPLACE FUNCTION private.tf_para_entradas(p_entradas jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sec text; v_fecha date; v_ref date; v_ment text[]; v_tf text; v_fuente text; n bigint;
  v_usados text[] := '{}'; v_res jsonb := '[]'; v_cand text; v_ant record; v_sig record; v_encaja boolean; v_info jsonb;
BEGIN
  n := substring(public.siguiente_tf() FROM 4)::bigint;
  FOR r IN SELECT (x->>'origen_tipo') AS origen_tipo, (x->>'solicitud_id')::uuid AS solicitud_id, nullif(x->>'movimiento_id', '')::uuid AS movimiento_id
    FROM jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) WITH ORDINALITY AS a(x, o) ORDER BY o
  LOOP
    SELECT v.secuencia, v.fecha INTO v_sec, v_fecha FROM public.vista_registro_diario v WHERE v.origen_tipo = r.origen_tipo AND v.id = r.solicitud_id;
    IF NOT FOUND OR private.normalizar_tf(v_sec) IS NOT NULL THEN CONTINUE; END IF;
    v_ref := coalesce((SELECT fecha FROM public.banco_movimientos WHERE id = r.movimiento_id), v_fecha);
    v_tf := NULL; v_fuente := 'nuevo'; v_cand := NULL; v_info := NULL;
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
        IF v_encaja AND private.tf_libre(v_cand, r.solicitud_id) AND NOT v_cand = ANY(v_usados)
           AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_cand) THEN
          v_tf := v_cand; v_fuente := 'viaje';
        END IF;
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
      'secuencia_actual', v_sec, 'tf', v_tf, 'fuente', v_fuente, 'viaje', v_info);
  END LOOP;
  RETURN v_res;
END $$;

-- Lote de sugerencias exactas: igual que antes; los TF asignados quedan marcados «TF asignado retroactivamente».
CREATE OR REPLACE FUNCTION public.conciliar_exactas_lote(p_pares jsonb, p_asignar_tf boolean DEFAULT false, p_tf_previstos jsonb DEFAULT NULL)
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
    v_asig := private.tf_para_entradas((SELECT jsonb_agg(jsonb_build_object('origen_tipo', x->>'origen_tipo', 'solicitud_id', x->>'solicitud_id', 'movimiento_id', x->>'movimiento_id') ORDER BY o)
      FROM jsonb_array_elements(p_pares) WITH ORDINALITY AS q(x, o)));
    IF EXISTS (
      SELECT 1 FROM (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(v_asig) x) a1
      FULL JOIN (SELECT x->>'solicitud_id' AS s, x->>'tf' AS tf FROM jsonb_array_elements(coalesce(p_tf_previstos, '[]'::jsonb)) x) b1 ON a1.s = b1.s
      WHERE a1.s IS NULL OR b1.s IS NULL OR a1.tf IS DISTINCT FROM b1.tf
    ) THEN
      RAISE EXCEPTION 'Los números TF cambiaron mientras revisabas. No se concilió ninguno ni se usó ningún número; revisa la nueva vista previa.';
    END IF;
    FOR a IN SELECT * FROM jsonb_to_recordset(v_asig) AS y(origen_tipo text, solicitud_id uuid, secuencia_actual text, tf text, fuente text, viaje jsonb) LOOP
      IF a.origen_tipo = 'transporte' THEN
        UPDATE public.solicitudes_pago_transporte SET numero_control = a.tf, tf_retroactivo = true WHERE id = a.solicitud_id;
        UPDATE public.transportes SET numero_control_pago = a.tf
        WHERE solicitud_pago_id = a.solicitud_id AND eliminado_en IS NULL
          AND (numero_control_pago IS NULL OR numero_control_pago = a.secuencia_actual OR private.normalizar_tf(numero_control_pago) = a.tf);
      ELSE
        UPDATE public.solicitudes_pago_transferencia SET secuencia = a.tf, tf_retroactivo = true WHERE id = a.solicitud_id;
      END IF;
      PERFORM setval('public.solicitudes_pago_transferencia_seq',
        greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(a.tf FROM 4)::bigint));
      INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
      VALUES (CASE WHEN a.origen_tipo = 'transporte' THEN 'solicitudes_pago_transporte' ELSE 'solicitudes_pago_transferencia' END,
        a.solicitud_id, 'TF_ASIGNADO_AL_CONCILIAR', v_uid, jsonb_build_object(
          'numero_anterior', a.secuencia_actual, 'tf', a.tf, 'fuente', a.fuente, 'viaje', a.viaje, 'lote', v_lote, 'retroactivo', true));
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

-- Crear entrada desde banco: en una cuenta compartida el beneficiario debe ser uno de sus titulares.
CREATE OR REPLACE FUNCTION public.crear_entrada_diario_desde_banco(
  p_movimiento uuid, p_fecha date, p_categoria text, p_beneficiario text, p_concepto text, p_tf_previsto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.banco_movimientos%ROWTYPE; v_tf text; v_id uuid; v_uid uuid := auth.uid(); v_tit text[];
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para crear entradas desde el banco';
  END IF;
  IF coalesce(trim(p_categoria),'') = '' OR coalesce(trim(p_beneficiario),'') = '' OR coalesce(trim(p_concepto),'') = '' THEN
    RAISE EXCEPTION 'Categoría, beneficiario y concepto son obligatorios';
  END IF;
  SELECT * INTO m FROM public.banco_movimientos WHERE id = p_movimiento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF m.tipo <> 'debito' THEN RAISE EXCEPTION 'Solo se crean entradas desde débitos'; END IF;
  IF m.conciliado THEN RAISE EXCEPTION 'Este movimiento ya fue conciliado. Recarga la pantalla.'; END IF;
  IF coalesce(m.descripcion, '') ~* '\mCOM\M' AND ltrim(coalesce(m.referencia, ''), '0') <> ''
     AND EXISTS (SELECT 1 FROM public.banco_movimientos p WHERE p.id <> m.id AND p.tipo = 'debito'
       AND ltrim(coalesce(p.referencia, ''), '0') = ltrim(m.referencia, '0') AND coalesce(p.descripcion, '') !~* '\mCOM\M') THEN
    RAISE EXCEPTION 'Es la comisión de un pago con la misma referencia: vincúlala a ese pago, sin crear un TF propio';
  END IF;
  SELECT c.titulares INTO v_tit FROM public.banco_cuentas_beneficiario c
  WHERE c.activo AND ltrim(c.cuenta, '0') = ltrim(substring(m.descripcion FROM 'IB a ([0-9]+)'), '0');
  IF cardinality(v_tit) >= 2 AND NOT EXISTS (SELECT 1 FROM unnest(v_tit) t WHERE private.clave_nombre(t) = private.clave_nombre(p_beneficiario)) THEN
    RAISE EXCEPTION 'La cuenta % es compartida (%): elige uno de sus titulares como beneficiario.',
      substring(m.descripcion FROM 'IB a ([0-9]+)'), array_to_string(v_tit, ' y/o ');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));
  v_tf := public.siguiente_tf();

  INSERT INTO public.solicitudes_pago_transferencia
    (secuencia, fecha, categoria, beneficiario, concepto, monto, descuento_cxc, creado_por, origen, banco_movimiento_id, estado)
  VALUES (v_tf, coalesce(p_fecha, m.fecha), trim(p_categoria), trim(p_beneficiario), trim(p_concepto), m.monto, 0, v_uid, 'banco', m.id, 'pagada')
  RETURNING id INTO v_id;

  PERFORM setval('public.solicitudes_pago_transferencia_seq',
    greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(v_tf FROM 4)::bigint));

  INSERT INTO public.banco_conciliaciones(movimiento_id, origen_tipo, solicitud_id, monto_diario, monto_aplicado, diferencia, creado_por)
  VALUES (m.id, 'transferencia', v_id, m.monto, m.monto, 0, v_uid);

  UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'diario', conciliado_id = v_id,
    conciliado_por = v_uid, conciliado_en = now(), diferencia_diario = 0, motivo_diferencia = NULL,
    notas = 'Entrada ' || v_tf || ' creada desde banco'
  WHERE id = m.id;

  PERFORM public.aprender_cuenta_beneficiario(m.descripcion, p_beneficiario, 'otro');

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('solicitudes_pago_transferencia', v_id, 'CREADA_DESDE_BANCO', v_uid, jsonb_build_object(
    'secuencia', v_tf, 'tf_previsto', p_tf_previsto, 'movimiento_id', m.id, 'referencia_bancaria', m.referencia,
    'fecha_banco', m.fecha, 'monto', m.monto, 'categoria', trim(p_categoria), 'beneficiario', trim(p_beneficiario)));

  RETURN jsonb_build_object('id', v_id, 'secuencia', v_tf, 'cambio_numero', p_tf_previsto IS NOT NULL AND p_tf_previsto <> v_tf);
END $$;

-- Lote retroactivo: beneficiario por movimiento opcional (cuentas compartidas)
DROP FUNCTION IF EXISTS public.crear_entradas_diario_lote(uuid[], text, text, text, text[]);
CREATE FUNCTION public.crear_entradas_diario_lote(
  p_movimientos uuid[], p_categoria text, p_beneficiario text, p_concepto text, p_tf_previstos text[] DEFAULT NULL, p_beneficiarios jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int := coalesce(cardinality(p_movimientos), 0); v_inicio date;
  r record; v_res jsonb; v_secs text[] := '{}'; v_total numeric := 0; v_lote uuid := gen_random_uuid(); v_benef text;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para crear entradas desde el banco';
  END IF;
  IF v_n = 0 OR v_n > 100 THEN RAISE EXCEPTION 'Elige entre 1 y 100 movimientos'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_movimientos) x) <> v_n THEN RAISE EXCEPTION 'Hay movimientos repetidos'; END IF;
  SELECT min(fecha) INTO v_inicio FROM public.vista_registro_diario WHERE origen = 'manual';
  PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));

  FOR r IN SELECT m.id, m.fecha, m.monto FROM public.banco_movimientos m
    WHERE m.id = ANY(p_movimientos) ORDER BY m.fecha, m.created_at, m.id
  LOOP
    IF v_inicio IS NOT NULL AND r.fecha < v_inicio THEN
      RAISE EXCEPTION 'El movimiento del % es anterior al Diario (%)', to_char(r.fecha, 'DD/MM/YYYY'), to_char(v_inicio, 'DD/MM/YYYY');
    END IF;
    v_benef := coalesce(nullif(trim(p_beneficiarios->>(r.id::text)), ''), p_beneficiario);
    v_res := public.crear_entrada_diario_desde_banco(r.id, r.fecha, p_categoria, v_benef, p_concepto, NULL);
    UPDATE public.solicitudes_pago_transferencia SET retroactiva = true WHERE id = (v_res->>'id')::uuid;
    UPDATE public.banco_movimientos SET notas = 'Entrada ' || (v_res->>'secuencia') || ' creada desde banco (retroactiva)' WHERE id = r.id;
    v_secs := v_secs || (v_res->>'secuencia');
    v_total := v_total + r.monto;
  END LOOP;
  IF cardinality(v_secs) <> v_n THEN RAISE EXCEPTION 'Algún movimiento ya no existe. Recarga la pantalla.'; END IF;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', NULL, 'LOTE_ENTRADAS_RETROACTIVAS', v_uid, jsonb_build_object(
    'lote', v_lote, 'secuencias', v_secs, 'previstas', p_tf_previstos, 'beneficiario', trim(p_beneficiario),
    'beneficiarios', p_beneficiarios, 'categoria', trim(p_categoria), 'cantidad', v_n, 'total', v_total));

  RETURN jsonb_build_object('secuencias', v_secs, 'total', v_total,
    'cambio_numero', p_tf_previstos IS NOT NULL AND p_tf_previstos IS DISTINCT FROM v_secs);
END $$;

REVOKE ALL ON FUNCTION private.clave_nombre(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_entradas_diario_lote(uuid[], text, text, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_entradas_diario_lote(uuid[], text, text, text, text[], jsonb) TO authenticated;