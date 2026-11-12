-- 1. Columnas nuevas
ALTER TABLE public.banco_movimientos
  ADD COLUMN IF NOT EXISTS vinculado_movimiento_id uuid REFERENCES public.banco_movimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS diferencia_diario numeric(14,2),
  ADD COLUMN IF NOT EXISTS motivo_diferencia text;

ALTER TABLE public.solicitudes_pago_transferencia
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS banco_movimiento_id uuid REFERENCES public.banco_movimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pagada',
  ADD COLUMN IF NOT EXISTS anulado_en timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_motivo text;
ALTER TABLE public.solicitudes_pago_transferencia
  ADD CONSTRAINT spt_origen_check CHECK (origen IN ('manual','banco')),
  ADD CONSTRAINT spt_estado_check CHECK (estado IN ('pagada','anulada'));

-- 2. Vínculos movimiento ↔ entradas del Diario
CREATE TABLE public.banco_conciliaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id uuid NOT NULL REFERENCES public.banco_movimientos(id) ON DELETE CASCADE,
  origen_tipo text NOT NULL CHECK (origen_tipo IN ('transporte','transferencia')),
  solicitud_id uuid NOT NULL,
  monto_diario numeric(14,2) NOT NULL,
  monto_aplicado numeric(14,2) NOT NULL,
  diferencia numeric(14,2) NOT NULL DEFAULT 0,
  motivo_diferencia text,
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origen_tipo, solicitud_id)
);
CREATE INDEX idx_banco_conc_mov ON public.banco_conciliaciones(movimiento_id);
GRANT SELECT ON public.banco_conciliaciones TO authenticated;
GRANT ALL ON public.banco_conciliaciones TO service_role;
ALTER TABLE public.banco_conciliaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banco_conciliaciones finanzas lectura" ON public.banco_conciliaciones FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]));

-- 3. Reglas por palabra clave
CREATE TABLE public.banco_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palabra_clave text NOT NULL UNIQUE,
  categoria text,
  concepto text,
  beneficiario text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banco_reglas TO authenticated;
GRANT ALL ON public.banco_reglas TO service_role;
ALTER TABLE public.banco_reglas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banco_reglas finanzas" ON public.banco_reglas FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]));
CREATE TRIGGER banco_reglas_touch BEFORE UPDATE ON public.banco_reglas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Cuentas destino → beneficiario
CREATE TABLE public.banco_cuentas_beneficiario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta text NOT NULL UNIQUE,
  beneficiario text NOT NULL,
  tipo text NOT NULL DEFAULT 'otro' CHECK (tipo IN ('transportista','gestor','otro')),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('aprendida','manual')),
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banco_cuentas_beneficiario TO authenticated;
GRANT ALL ON public.banco_cuentas_beneficiario TO service_role;
ALTER TABLE public.banco_cuentas_beneficiario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banco_cuentas finanzas" ON public.banco_cuentas_beneficiario FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]));
CREATE TRIGGER banco_cuentas_touch BEFORE UPDATE ON public.banco_cuentas_beneficiario FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Registro de Diario: una fila por pago, con datos de conciliación
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
  (bc.id IS NOT NULL) AS conciliado
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
  (bc.id IS NOT NULL) AS conciliado
FROM public.solicitudes_pago_transferencia s
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transferencia' AND bc.solicitud_id = s.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
WHERE s.eliminado_en IS NULL AND s.estado <> 'anulada';
GRANT SELECT ON public.vista_registro_diario TO authenticated;

-- 6. Funciones
CREATE OR REPLACE FUNCTION public.siguiente_tf()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ult text; n bigint; v_tf text;
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la secuencia TF';
  END IF;
  SELECT x INTO v_ult FROM (
    SELECT secuencia AS x, created_at AS c FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
    UNION ALL
    SELECT numero_control, created_at FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
  ) u ORDER BY c DESC, x DESC LIMIT 1;
  n := COALESCE(substring(v_ult FROM 4)::bigint, 0) + 1;
  LOOP
    v_tf := 'TF-' || lpad(n::text, 7, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transferencia WHERE secuencia = v_tf)
      AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transporte WHERE numero_control = v_tf)
      AND NOT EXISTS (SELECT 1 FROM public.transportes WHERE replace(numero_control_pago, '-', '') = replace(v_tf, '-', ''));
    n := n + 1;
  END LOOP;
  RETURN v_tf;
END $$;

CREATE OR REPLACE FUNCTION public.aprender_cuenta_beneficiario(p_descripcion text, p_beneficiario text, p_tipo text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.banco_cuentas_beneficiario(cuenta, beneficiario, tipo, origen)
  SELECT substring(p_descripcion FROM 'IB a ([0-9]+)'), trim(p_beneficiario),
    CASE WHEN EXISTS (SELECT 1 FROM public.catalogo_gestores_honorarios g WHERE upper(trim(g.nombre)) = upper(trim(p_beneficiario)))
      THEN 'gestor' ELSE p_tipo END,
    'aprendida'
  WHERE private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[])
    AND substring(p_descripcion FROM 'IB a ([0-9]+)') IS NOT NULL
    AND coalesce(trim(p_beneficiario), '') <> ''
  ON CONFLICT (cuenta) DO NOTHING;
$$;

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

CREATE OR REPLACE FUNCTION public.conciliar_movimiento_diario(p_movimiento uuid, p_entradas jsonb, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.banco_movimientos%ROWTYPE; v_uid uuid := auth.uid();
  v_n int; v_total numeric; v_benefs int; v_benef text; v_tipos int; v_tipo text;
  v_dif numeric; r record; v_i int := 0; v_acum numeric := 0; v_aplicado numeric; v_primero uuid; v_secs text;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF p_entradas IS NULL OR jsonb_typeof(p_entradas) <> 'array' OR jsonb_array_length(p_entradas) = 0 THEN
    RAISE EXCEPTION 'Elige al menos una entrada del Diario';
  END IF;
  SELECT * INTO m FROM public.banco_movimientos WHERE id = p_movimiento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF m.tipo <> 'debito' THEN RAISE EXCEPTION 'Solo se concilian débitos con el Diario'; END IF;
  IF m.conciliado THEN RAISE EXCEPTION 'Este movimiento ya fue conciliado. Recarga la pantalla.'; END IF;

  SELECT count(*), coalesce(sum(v.neto), 0),
    count(DISTINCT upper(regexp_replace(v.beneficiario, '[^A-Za-z]', '', 'g'))), min(v.beneficiario),
    count(DISTINCT v.origen_tipo), min(v.origen_tipo), string_agg(v.secuencia, ', ' ORDER BY v.fecha, v.secuencia)
  INTO v_n, v_total, v_benefs, v_benef, v_tipos, v_tipo, v_secs
  FROM (SELECT DISTINCT * FROM jsonb_to_recordset(p_entradas) AS e(origen_tipo text, solicitud_id uuid)) e
  JOIN public.vista_registro_diario v ON v.origen_tipo = e.origen_tipo AND v.id = e.solicitud_id;

  IF v_n <> jsonb_array_length(p_entradas) THEN
    RAISE EXCEPTION 'Alguna entrada ya no existe, está repetida o fue anulada. Recarga la pantalla.';
  END IF;

  v_dif := round(m.monto - v_total, 2);
  IF abs(v_dif) >= 0.01 AND coalesce(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Indica el motivo de la diferencia de RD$ %', v_dif;
  END IF;

  FOR r IN
    SELECT v.origen_tipo, v.id, v.neto
    FROM (SELECT DISTINCT * FROM jsonb_to_recordset(p_entradas) AS e(origen_tipo text, solicitud_id uuid)) e
    JOIN public.vista_registro_diario v ON v.origen_tipo = e.origen_tipo AND v.id = e.solicitud_id
    ORDER BY v.fecha, v.secuencia
  LOOP
    v_i := v_i + 1;
    IF v_primero IS NULL THEN v_primero := r.id; END IF;
    IF v_i = v_n THEN v_aplicado := m.monto - v_acum;
    ELSE v_aplicado := CASE WHEN v_total = 0 THEN 0 ELSE round(m.monto * r.neto / v_total, 2) END;
    END IF;
    v_acum := v_acum + v_aplicado;
    INSERT INTO public.banco_conciliaciones
      (movimiento_id, origen_tipo, solicitud_id, monto_diario, monto_aplicado, diferencia, motivo_diferencia, creado_por)
    VALUES (m.id, r.origen_tipo, r.id, r.neto, v_aplicado, v_aplicado - r.neto,
      CASE WHEN abs(v_dif) >= 0.01 THEN trim(p_motivo) END, v_uid);
  END LOOP;

  UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'diario', conciliado_id = v_primero,
    conciliado_por = v_uid, conciliado_en = now(), diferencia_diario = v_dif,
    motivo_diferencia = CASE WHEN abs(v_dif) >= 0.01 THEN trim(p_motivo) END,
    notas = v_secs
  WHERE id = m.id;

  IF v_benefs = 1 THEN
    PERFORM public.aprender_cuenta_beneficiario(m.descripcion, v_benef,
      CASE WHEN v_tipos = 1 AND v_tipo = 'transporte' THEN 'transportista' ELSE 'otro' END);
  END IF;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', m.id, 'CONCILIADO_DIARIO', v_uid, jsonb_build_object(
    'entradas', v_secs, 'monto_banco', m.monto, 'monto_diario', v_total, 'diferencia', v_dif,
    'motivo', CASE WHEN abs(v_dif) >= 0.01 THEN trim(p_motivo) END, 'referencia_bancaria', m.referencia));

  RETURN jsonb_build_object('entradas', v_n, 'diferencia', v_dif, 'secuencias', v_secs);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Una de las entradas ya está conciliada con otro movimiento. Recarga la pantalla.';
END $$;

CREATE OR REPLACE FUNCTION public.deshacer_conciliacion_banco(p_movimiento uuid, p_anular_creada boolean DEFAULT false, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    motivo_diferencia = NULL, vinculado_movimiento_id = NULL
  WHERE id = m.id;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', m.id, 'CONCILIACION_DESHECHA', v_uid, jsonb_build_object(
    'tipo_anterior', m.conciliado_tipo, 'notas_anteriores', m.notas, 'entrada_creada', v_creada_sec,
    'entrada_anulada', v_anulada, 'motivo', nullif(trim(p_motivo), '')));

  RETURN jsonb_build_object('anulada', CASE WHEN v_anulada THEN v_creada_sec END);
END $$;

CREATE OR REPLACE FUNCTION public.marcar_movimiento_banco(p_movimiento uuid, p_tipo text, p_motivo text DEFAULT NULL, p_vinculado uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.banco_movimientos%ROWTYPE; p public.banco_movimientos%ROWTYPE; v_uid uuid := auth.uid(); v_nota text;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF p_tipo NOT IN ('ignorado','comision') THEN RAISE EXCEPTION 'Tipo no válido'; END IF;
  SELECT * INTO m FROM public.banco_movimientos WHERE id = p_movimiento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF m.tipo <> 'debito' THEN RAISE EXCEPTION 'Solo aplica a débitos'; END IF;
  IF m.conciliado THEN RAISE EXCEPTION 'Este movimiento ya fue conciliado. Recarga la pantalla.'; END IF;

  IF p_tipo = 'ignorado' THEN
    IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indica por qué no aplica'; END IF;
    v_nota := 'No aplica: ' || trim(p_motivo);
  ELSE
    SELECT * INTO p FROM public.banco_movimientos WHERE id = p_vinculado;
    IF NOT FOUND OR p.id = m.id OR p.tipo <> 'debito' THEN RAISE EXCEPTION 'Elige el pago al que pertenece la comisión'; END IF;
    IF ltrim(coalesce(p.referencia, ''), '0') <> ltrim(coalesce(m.referencia, ''), '0') OR coalesce(m.referencia, '') = '' THEN
      RAISE EXCEPTION 'La comisión y el pago deben compartir la misma referencia';
    END IF;
    v_nota := 'Comisión del pago ' || coalesce(p.descripcion, '') || ' (' || to_char(p.monto, 'FM999,999,990.00') || ')';
  END IF;

  UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = p_tipo, conciliado_id = NULL,
    vinculado_movimiento_id = CASE WHEN p_tipo = 'comision' THEN p_vinculado END,
    conciliado_por = v_uid, conciliado_en = now(), notas = v_nota
  WHERE id = m.id;

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_movimientos', m.id, CASE WHEN p_tipo = 'ignorado' THEN 'MOVIMIENTO_IGNORADO' ELSE 'COMISION_VINCULADA' END,
    v_uid, jsonb_build_object('nota', v_nota, 'vinculado', p_vinculado, 'monto', m.monto, 'referencia_bancaria', m.referencia));
END $$;

REVOKE EXECUTE ON FUNCTION public.siguiente_tf() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.aprender_cuenta_beneficiario(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crear_entrada_diario_desde_banco(uuid, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.conciliar_movimiento_diario(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deshacer_conciliacion_banco(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_movimiento_banco(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siguiente_tf() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_entrada_diario_desde_banco(uuid, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_movimiento_diario(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_conciliacion_banco(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_movimiento_banco(uuid, text, text, uuid) TO authenticated;