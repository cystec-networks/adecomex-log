-- Cuentas destino precargadas (nombre pendiente = '')
ALTER TABLE public.banco_cuentas_beneficiario DROP CONSTRAINT IF EXISTS banco_cuentas_beneficiario_origen_check;
ALTER TABLE public.banco_cuentas_beneficiario ADD CONSTRAINT banco_cuentas_beneficiario_origen_check
  CHECK (origen IN ('aprendida','manual','precargada'));
ALTER TABLE public.banco_cuentas_beneficiario ALTER COLUMN beneficiario SET DEFAULT '';

-- Marcas en bloque reversibles
ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS lote_marcado uuid;

-- Entradas creadas desde banco de forma retroactiva
ALTER TABLE public.solicitudes_pago_transferencia ADD COLUMN IF NOT EXISTS retroactiva boolean NOT NULL DEFAULT false;

-- Notas de números TF sin uso
CREATE TABLE public.tf_sin_uso_notas (
  secuencia text PRIMARY KEY CHECK (secuencia ~ '^TF-[0-9]+$'),
  nota text NOT NULL DEFAULT '',
  actualizado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tf_sin_uso_notas TO authenticated;
GRANT ALL ON public.tf_sin_uso_notas TO service_role;
ALTER TABLE public.tf_sin_uso_notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tf_sin_uso_notas finanzas" ON public.tf_sin_uso_notas FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]));
CREATE TRIGGER tf_sin_uso_notas_touch BEFORE UPDATE ON public.tf_sin_uso_notas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.vista_tf_sin_uso WITH (security_invoker = true) AS
WITH u AS (
  SELECT substring(secuencia FROM 4)::bigint AS n FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
  UNION
  SELECT substring(numero_control FROM 4)::bigint FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
), r AS (SELECT min(n) AS a, max(n) AS b FROM u)
SELECT 'TF-' || lpad(g::text, 7, '0') AS secuencia,
  coalesce(n.nota, '') AS nota, n.updated_at, n.actualizado_por,
  (SELECT string_agg(t.numero_viaje, ', ' ORDER BY t.numero_viaje) FROM public.transportes t
    WHERE t.eliminado_en IS NULL AND (
      upper(replace(coalesce(t.numero_control_pago, ''), '-', '')) = 'TF' || lpad(g::text, 7, '0')
      OR upper(replace(coalesce(t.pago_referencia, ''), '-', '')) = 'TF' || lpad(g::text, 7, '0'))) AS transportes_que_lo_mencionan
FROM r CROSS JOIN LATERAL generate_series(r.a, r.b) AS g
LEFT JOIN public.tf_sin_uso_notas n ON n.secuencia = 'TF-' || lpad(g::text, 7, '0')
WHERE NOT EXISTS (SELECT 1 FROM u WHERE u.n = g);
GRANT SELECT ON public.vista_tf_sin_uso TO authenticated;

-- Diario: marca retroactiva (columna nueva al final)
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
  false AS retroactiva
FROM public.solicitudes_pago_transporte t
LEFT JOIN LATERAL (
  SELECT string_agg(x.numero_viaje, ', ' ORDER BY x.numero_viaje) AS refs
  FROM public.transportes x WHERE x.solicitud_pago_id = t.id
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
  s.retroactiva
FROM public.solicitudes_pago_transferencia s
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transferencia' AND bc.solicitud_id = s.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
WHERE s.eliminado_en IS NULL AND s.estado <> 'anulada';
GRANT SELECT ON public.vista_registro_diario TO authenticated;

-- Aprender: completa también las cuentas precargadas sin nombre
CREATE OR REPLACE FUNCTION public.aprender_cuenta_beneficiario(p_descripcion text, p_beneficiario text, p_tipo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.banco_cuentas_beneficiario(cuenta, beneficiario, tipo, origen)
  SELECT ltrim(substring(p_descripcion FROM 'IB a ([0-9]+)'), '0'), trim(p_beneficiario),
    CASE WHEN EXISTS (SELECT 1 FROM public.catalogo_gestores_honorarios g WHERE upper(trim(g.nombre)) = upper(trim(p_beneficiario)))
      THEN 'gestor' ELSE p_tipo END,
    'aprendida'
  WHERE private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[])
    AND substring(p_descripcion FROM 'IB a ([0-9]+)') IS NOT NULL
    AND coalesce(trim(p_beneficiario), '') <> ''
  ON CONFLICT (cuenta) DO UPDATE SET beneficiario = EXCLUDED.beneficiario, tipo = EXCLUDED.tipo, origen = 'aprendida'
    WHERE public.banco_cuentas_beneficiario.beneficiario = '';
$$;

-- Precargar cuentas destino de débitos «IB a» pendientes (sin nombre)
CREATE OR REPLACE FUNCTION public.precargar_cuentas_banco()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  INSERT INTO public.banco_cuentas_beneficiario(cuenta, beneficiario, tipo, origen)
  SELECT DISTINCT ltrim(substring(descripcion FROM 'IB a ([0-9]+)'), '0'), '', 'otro', 'precargada'
  FROM public.banco_movimientos
  WHERE tipo = 'debito' AND NOT conciliado AND descripcion ~ 'IB a [0-9]+'
  ON CONFLICT (cuenta) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Crear entrada: nunca un TF propio para la comisión de un pago con la misma referencia
CREATE OR REPLACE FUNCTION public.crear_entrada_diario_desde_banco(
  p_movimiento uuid, p_fecha date, p_categoria text, p_beneficiario text, p_concepto text, p_tf_previsto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.banco_movimientos%ROWTYPE; v_tf text; v_id uuid; v_uid uuid := auth.uid();
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

-- Vista previa de los próximos N números TF (no consume ninguno)
CREATE OR REPLACE FUNCTION public.previsualizar_tf(p_cantidad integer)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint; v_tf text; r text[] := '{}';
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la secuencia TF';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 100 THEN RAISE EXCEPTION 'Cantidad entre 1 y 100'; END IF;
  n := substring(public.siguiente_tf() FROM 4)::bigint;
  LOOP
    v_tf := 'TF-' || lpad(n::text, 7, '0');
    IF NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transferencia WHERE secuencia = v_tf)
       AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transporte WHERE numero_control = v_tf)
       AND NOT EXISTS (SELECT 1 FROM public.transportes WHERE replace(numero_control_pago, '-', '') = replace(v_tf, '-', '')) THEN
      r := r || v_tf;
    END IF;
    EXIT WHEN cardinality(r) >= p_cantidad;
    n := n + 1;
  END LOOP;
  RETURN r;
END $$;

-- Lote de entradas retroactivas de un mismo beneficiario (todo o nada)
CREATE OR REPLACE FUNCTION public.crear_entradas_diario_lote(
  p_movimientos uuid[], p_categoria text, p_beneficiario text, p_concepto text, p_tf_previstos text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int := coalesce(cardinality(p_movimientos), 0); v_inicio date;
  r record; v_res jsonb; v_secs text[] := '{}'; v_total numeric := 0; v_lote uuid := gen_random_uuid();
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
    v_res := public.crear_entrada_diario_desde_banco(r.id, r.fecha, p_categoria, p_beneficiario, p_concepto, NULL);
    UPDATE public.solicitudes_pago_transferencia SET retroactiva = true WHERE id = (v_res->>'id')::uuid;
    UPDATE public.banco_movimientos SET notas = 'Entrada ' || (v_res->>'secuencia') || ' creada desde banco (retroactiva)' WHERE id = r.id;
    v_secs := v_secs || (v_res->>'secuencia');
    v_total := v_total + r.monto;
  END LOOP;
  IF cardinality(v_secs) <> v_n THEN RAISE EXCEPTION 'Algún movimiento ya no existe. Recarga la pantalla.'; END IF;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', NULL, 'LOTE_ENTRADAS_RETROACTIVAS', v_uid, jsonb_build_object(
    'lote', v_lote, 'secuencias', v_secs, 'previstas', p_tf_previstos, 'beneficiario', trim(p_beneficiario),
    'categoria', trim(p_categoria), 'cantidad', v_n, 'total', v_total));

  RETURN jsonb_build_object('secuencias', v_secs, 'total', v_total,
    'cambio_numero', p_tf_previstos IS NOT NULL AND p_tf_previstos IS DISTINCT FROM v_secs);
END $$;

-- «No aplica (anterior al Diario)» en bloque, reversible
CREATE OR REPLACE FUNCTION public.marcar_no_aplica_lote(p_movimientos uuid[], p_hasta date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int := coalesce(cardinality(p_movimientos), 0); v_ok int; v_inicio date;
  v_lote uuid := gen_random_uuid(); v_total numeric;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF v_n = 0 THEN RAISE EXCEPTION 'No hay movimientos para marcar'; END IF;
  SELECT min(fecha) INTO v_inicio FROM public.vista_registro_diario WHERE origen = 'manual';
  IF p_hasta IS NULL OR v_inicio IS NULL OR p_hasta > v_inicio THEN
    RAISE EXCEPTION 'La fecha límite debe ser el inicio del Diario o anterior';
  END IF;
  SELECT count(*), coalesce(sum(monto), 0) INTO v_ok, v_total FROM public.banco_movimientos
  WHERE id = ANY(p_movimientos) AND tipo = 'debito' AND NOT conciliado AND fecha < p_hasta;
  IF v_ok <> v_n OR (SELECT count(DISTINCT x) FROM unnest(p_movimientos) x) <> v_n THEN
    RAISE EXCEPTION 'Algún movimiento ya no está pendiente o no es anterior al %. Vuelve a abrir la vista previa.', to_char(p_hasta, 'DD/MM/YYYY');
  END IF;

  UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'ignorado', conciliado_id = NULL,
    conciliado_por = v_uid, conciliado_en = now(), notas = 'No aplica (anterior al Diario)', lote_marcado = v_lote
  WHERE id = ANY(p_movimientos);

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'banco_movimientos', id, 'MOVIMIENTO_IGNORADO', v_uid, jsonb_build_object(
    'nota', 'No aplica (anterior al Diario)', 'lote', v_lote, 'monto', monto, 'referencia_bancaria', referencia, 'fecha_banco', fecha)
  FROM public.banco_movimientos WHERE id = ANY(p_movimientos);

  RETURN jsonb_build_object('lote', v_lote, 'cantidad', v_n, 'total', v_total);
END $$;

CREATE OR REPLACE FUNCTION public.deshacer_lote_no_aplica(p_lote uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para deshacer conciliaciones';
  END IF;
  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'banco_movimientos', id, 'CONCILIACION_DESHECHA', v_uid, jsonb_build_object('tipo_anterior', 'ignorado', 'notas_anteriores', notas, 'lote', p_lote)
  FROM public.banco_movimientos WHERE lote_marcado = p_lote AND conciliado AND conciliado_tipo = 'ignorado' AND notas = 'No aplica (anterior al Diario)';
  UPDATE public.banco_movimientos SET conciliado = false, conciliado_tipo = NULL, conciliado_id = NULL,
    conciliado_por = NULL, conciliado_en = NULL, notas = NULL, lote_marcado = NULL
  WHERE lote_marcado = p_lote AND conciliado AND conciliado_tipo = 'ignorado' AND notas = 'No aplica (anterior al Diario)';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.precargar_cuentas_banco() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.previsualizar_tf(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crear_entradas_diario_lote(uuid[], text, text, text, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_no_aplica_lote(uuid[], date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deshacer_lote_no_aplica(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.aprender_cuenta_beneficiario(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crear_entrada_diario_desde_banco(uuid, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precargar_cuentas_banco() TO authenticated;
GRANT EXECUTE ON FUNCTION public.previsualizar_tf(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_entradas_diario_lote(uuid[], text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_no_aplica_lote(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_no_aplica(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_entrada_diario_desde_banco(uuid, date, text, text, text, text) TO authenticated;