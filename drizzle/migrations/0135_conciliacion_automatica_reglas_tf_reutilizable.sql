-- Conciliación automática: «No aplica» para débitos anteriores al Diario, comisiones vinculadas al pago del mismo día,
-- simulación (vista previa exacta sin guardar) para pendientes existentes, y TF liberados al deshacer un lote que se
-- reutilizan primero en la siguiente asignación.

ALTER TABLE public.tf_sin_uso_notas ADD COLUMN IF NOT EXISTS reutilizar boolean NOT NULL DEFAULT false;
ALTER TABLE public.tf_sin_uso_notas ADD COLUMN IF NOT EXISTS liberado_en timestamptz;
ALTER TABLE public.tf_sin_uso_notas ADD COLUMN IF NOT EXISTS liberado_de text;
ALTER TABLE public.banco_lotes_automaticos ADD COLUMN IF NOT EXISTS no_aplica integer NOT NULL DEFAULT 0;
ALTER TABLE public.banco_lotes_automaticos ADD COLUMN IF NOT EXISTS comisiones integer NOT NULL DEFAULT 0;
ALTER TABLE public.banco_lotes_automaticos ADD COLUMN IF NOT EXISTS tf_liberados text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.banco_lotes_automaticos ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'importacion';

-- TF liberado más bajo que sigue libre (se reutiliza primero).
CREATE OR REPLACE FUNCTION private.tf_reutilizable(p_excluir text[] DEFAULT '{}')
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.secuencia FROM public.tf_sin_uso_notas n
  WHERE n.reutilizar AND NOT (n.secuencia = ANY(coalesce(p_excluir, '{}'::text[]))) AND private.tf_libre(n.secuencia)
  ORDER BY substring(n.secuencia FROM 4)::bigint LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.tf_reutilizable(text[]) FROM PUBLIC, anon, authenticated;

-- Simulación en curso: no mover la secuencia (setval no se deshace con la transacción).
CREATE OR REPLACE FUNCTION private.simulando_tf()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('adecomex.simulacion_tf', true), '') = 'on' $$;
REVOKE ALL ON FUNCTION private.simulando_tf() FROM PUBLIC, anon, authenticated;

-- Siguiente TF = TF guardado más alto + 1 (saltando colisiones). Un TF reutilizado (más bajo) nunca rebobina la secuencia.
CREATE OR REPLACE FUNCTION public.siguiente_tf()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max bigint; n bigint; v_tf text;
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la secuencia TF';
  END IF;
  SELECT max(x) INTO v_max FROM (
    SELECT substring(secuencia FROM 4)::bigint AS x FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
    UNION ALL
    SELECT substring(numero_control FROM 4)::bigint FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
  ) u;
  n := coalesce(v_max, 0) + 1;
  LOOP
    v_tf := 'TF-' || lpad(n::text, 7, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transferencia WHERE secuencia = v_tf)
      AND NOT EXISTS (SELECT 1 FROM public.solicitudes_pago_transporte WHERE numero_control = v_tf)
      AND NOT EXISTS (SELECT 1 FROM public.transportes WHERE replace(numero_control_pago, '-', '') = replace(v_tf, '-', ''));
    n := n + 1;
  END LOOP;
  RETURN v_tf;
END $$;

-- Número de una solicitud nueva: primero un TF liberado; si no hay, la secuencia de siempre.
CREATE OR REPLACE FUNCTION public.tf_nuevo_numero()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));
  v := private.tf_reutilizable();
  IF v IS NOT NULL THEN RETURN v; END IF;
  RETURN 'TF-' || lpad(nextval('public.solicitudes_pago_transferencia_seq')::text, 7, '0');
END $$;
REVOKE ALL ON FUNCTION public.tf_nuevo_numero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tf_nuevo_numero() TO authenticated, service_role;
ALTER TABLE public.solicitudes_pago_transferencia ALTER COLUMN secuencia SET DEFAULT public.tf_nuevo_numero();
ALTER TABLE public.solicitudes_pago_transporte ALTER COLUMN numero_control SET DEFAULT public.tf_nuevo_numero();

-- Cuando un TF liberado vuelve a usarse (por cualquier camino), sale de «Números TF sin uso».
CREATE OR REPLACE FUNCTION public.tf_quitar_reutilizable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := private.normalizar_tf(to_jsonb(NEW) ->> TG_ARGV[0]);
BEGIN
  IF v IS NOT NULL THEN DELETE FROM public.tf_sin_uso_notas WHERE secuencia = v AND reutilizar; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tf_quitar_reutilizable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_spf_tf_reutilizado ON public.solicitudes_pago_transferencia;
CREATE TRIGGER trg_spf_tf_reutilizado AFTER INSERT OR UPDATE OF secuencia ON public.solicitudes_pago_transferencia
  FOR EACH ROW EXECUTE FUNCTION public.tf_quitar_reutilizable('secuencia');
DROP TRIGGER IF EXISTS trg_spt_tf_reutilizado ON public.solicitudes_pago_transporte;
CREATE TRIGGER trg_spt_tf_reutilizado AFTER INSERT OR UPDATE OF numero_control ON public.solicitudes_pago_transporte
  FOR EACH ROW EXECUTE FUNCTION public.tf_quitar_reutilizable('numero_control');

-- Lista «Números TF sin uso»: huecos de la secuencia y números con nota (p. ej. liberados por encima del último usado).
CREATE OR REPLACE VIEW public.vista_tf_sin_uso WITH (security_invoker = true) AS
WITH u AS (
  SELECT substring(secuencia FROM 4)::bigint AS n FROM public.solicitudes_pago_transferencia WHERE secuencia ~ '^TF-[0-9]+$'
  UNION
  SELECT substring(numero_control FROM 4)::bigint FROM public.solicitudes_pago_transporte WHERE numero_control ~ '^TF-[0-9]+$'
), r AS (SELECT min(n) AS a, max(n) AS b FROM u),
c AS (
  SELECT g AS n FROM r CROSS JOIN LATERAL generate_series(r.a, r.b) AS g
  UNION
  SELECT substring(secuencia FROM 4)::bigint FROM public.tf_sin_uso_notas
)
SELECT 'TF-' || lpad(c.n::text, 7, '0') AS secuencia,
  coalesce(n.nota, '') AS nota, n.updated_at, n.actualizado_por,
  (SELECT string_agg(t.numero_viaje, ', ' ORDER BY t.numero_viaje) FROM public.transportes t
    WHERE t.eliminado_en IS NULL AND (
      upper(replace(coalesce(t.numero_control_pago, ''), '-', '')) = 'TF' || lpad(c.n::text, 7, '0')
      OR upper(replace(coalesce(t.pago_referencia, ''), '-', '')) = 'TF' || lpad(c.n::text, 7, '0'))) AS transportes_que_lo_mencionan,
  coalesce(n.reutilizar, false) AS reutilizable
FROM c
LEFT JOIN public.tf_sin_uso_notas n ON n.secuencia = 'TF-' || lpad(c.n::text, 7, '0')
WHERE NOT EXISTS (SELECT 1 FROM u WHERE u.n = c.n);
GRANT SELECT ON public.vista_tf_sin_uso TO authenticated;

-- Vista previa de los próximos N números: primero los liberados, luego la secuencia.
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

-- TF por entrada (igual que antes) + los liberados se usan primero en la asignación automática.
CREATE OR REPLACE FUNCTION private.tf_para_entradas(p_entradas jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sec text; v_fecha date; v_ref date; v_ment text[]; v_tf text; v_fuente text; n bigint; v_sig_num bigint;
  v_usados text[] := '{}'; v_manuales text[] := '{}'; v_res jsonb := '[]'; v_cand text; v_ant record; v_sig record; v_encaja boolean;
  v_info jsonb; v_error text; v_aviso text; v_otro text;
BEGIN
  v_sig_num := substring(public.siguiente_tf() FROM 4)::bigint;
  n := v_sig_num;
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
      v_tf := private.tf_reutilizable(v_usados || v_manuales);
      IF v_tf IS NOT NULL THEN
        v_fuente := 'reutilizado';
      ELSE
        LOOP
          v_tf := 'TF-' || lpad(n::text, 7, '0');
          EXIT WHEN private.tf_libre(v_tf) AND NOT v_tf = ANY(v_usados) AND NOT v_tf = ANY(v_manuales)
            AND NOT EXISTS (SELECT 1 FROM public.tf_sin_uso_notas WHERE secuencia = v_tf);
          n := n + 1;
        END LOOP;
        n := n + 1;
      END IF;
    END IF;
    v_usados := v_usados || v_tf;
    v_res := v_res || jsonb_build_object('origen_tipo', r.origen_tipo, 'solicitud_id', r.solicitud_id,
      'secuencia_actual', v_sec, 'tf', v_tf, 'fuente', v_fuente, 'viaje', v_info);
  END LOOP;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION private.tf_para_entradas(jsonb) FROM PUBLIC, anon, authenticated;

-- Crear entrada desde banco: primero un TF liberado; en simulación no mueve la secuencia.
CREATE OR REPLACE FUNCTION public.crear_entrada_diario_desde_banco(
  p_movimiento uuid, p_fecha date, p_categoria text, p_beneficiario text, p_concepto text, p_tf_previsto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.banco_movimientos%ROWTYPE; v_tf text; v_id uuid; v_uid uuid := auth.uid(); v_tit text[]; v_reutilizado boolean;
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
  v_tf := private.tf_reutilizable();
  v_reutilizado := v_tf IS NOT NULL;
  IF v_tf IS NULL THEN v_tf := public.siguiente_tf(); END IF;

  INSERT INTO public.solicitudes_pago_transferencia
    (secuencia, fecha, categoria, beneficiario, concepto, monto, descuento_cxc, creado_por, origen, banco_movimiento_id, estado)
  VALUES (v_tf, coalesce(p_fecha, m.fecha), trim(p_categoria), trim(p_beneficiario), trim(p_concepto), m.monto, 0, v_uid, 'banco', m.id, 'pagada')
  RETURNING id INTO v_id;

  IF NOT private.simulando_tf() THEN
    PERFORM setval('public.solicitudes_pago_transferencia_seq',
      greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(v_tf FROM 4)::bigint));
  END IF;

  INSERT INTO public.banco_conciliaciones(movimiento_id, origen_tipo, solicitud_id, monto_diario, monto_aplicado, diferencia, creado_por)
  VALUES (m.id, 'transferencia', v_id, m.monto, m.monto, 0, v_uid);

  UPDATE public.banco_movimientos SET conciliado = true, conciliado_tipo = 'diario', conciliado_id = v_id,
    conciliado_por = v_uid, conciliado_en = now(), diferencia_diario = 0, motivo_diferencia = NULL,
    notas = 'Entrada ' || v_tf || ' creada desde banco'
  WHERE id = m.id;

  PERFORM public.aprender_cuenta_beneficiario(m.descripcion, p_beneficiario, 'otro');

  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('solicitudes_pago_transferencia', v_id, 'CREADA_DESDE_BANCO', v_uid, jsonb_build_object(
    'secuencia', v_tf, 'tf_previsto', p_tf_previsto, 'tf_reutilizado', v_reutilizado, 'movimiento_id', m.id, 'referencia_bancaria', m.referencia,
    'fecha_banco', m.fecha, 'monto', m.monto, 'categoria', trim(p_categoria), 'beneficiario', trim(p_beneficiario)));

  RETURN jsonb_build_object('id', v_id, 'secuencia', v_tf, 'cambio_numero', p_tf_previsto IS NOT NULL AND p_tf_previsto <> v_tf);
END $$;

-- Conciliación automática (tras importar o sobre pendientes existentes).
DROP FUNCTION IF EXISTS public.conciliar_automatico_importacion(jsonb, jsonb, text);
CREATE FUNCTION public.conciliar_automatico_importacion(
  p_items jsonb, p_revision jsonb DEFAULT '[]'::jsonb, p_archivo text DEFAULT NULL,
  p_simular boolean DEFAULT false, p_origen text DEFAULT 'importacion', p_previsto jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_lote uuid := gen_random_uuid(); v_inicio date; r record; m public.banco_movimientos%ROWTYPE; e record;
  v_motivo text; v_detalle jsonb := '[]'; v_conc int := 0; v_creadas int := 0; v_rev int := 0; v_noap int := 0; v_com int := 0; v_total numeric := 0;
  v_asig jsonb; v_tf text; v_fuente text; v_res jsonb; v_n int; v_pago uuid; p record; v_viajes jsonb; v_resultado jsonb;
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para conciliar';
  END IF;
  IF p_origen NOT IN ('importacion', 'pendientes') THEN RAISE EXCEPTION 'Origen no válido'; END IF;
  BEGIN
    IF p_simular THEN PERFORM set_config('adecomex.simulacion_tf', 'on', true); END IF;
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
                IF NOT private.simulando_tf() THEN
                  PERFORM setval('public.solicitudes_pago_transferencia_seq',
                    greatest((SELECT last_value FROM public.solicitudes_pago_transferencia_seq), substring(v_tf FROM 4)::bigint));
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

-- Deshacer un lote automático: débitos a Pendiente, entradas creadas «Anulada» (nunca se borran) y los TF puestos a
-- entradas que ya existían se quitan de ellas y pasan a «Números TF sin uso» para reutilizarse primero.
CREATE OR REPLACE FUNCTION public.deshacer_lote_automatico(p_lote uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int := 0; v_anuladas int := 0; r record; v_res jsonb; l record; d jsonb; v_tf text; v_ok int;
  v_liberados text[] := '{}';
BEGIN
  IF NOT private.has_any_role(v_uid, ARRAY['admin','finanzas','contabilidad']::app_role[]) THEN
    RAISE EXCEPTION 'Sin permiso para deshacer conciliaciones';
  END IF;
  SELECT * INTO l FROM public.banco_lotes_automaticos WHERE id = p_lote FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado'; END IF;
  IF l.deshecho_en IS NOT NULL THEN RAISE EXCEPTION 'Este lote ya fue deshecho'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('secuencia_tf'));
  FOR r IN SELECT id FROM public.banco_movimientos
    WHERE lote_conciliacion = p_lote AND conciliado AND conciliado_auto ORDER BY fecha DESC, created_at DESC FOR UPDATE LOOP
    v_res := public.deshacer_conciliacion_banco(r.id, true, coalesce(nullif(trim(p_motivo), ''), 'Conciliación automática deshecha'));
    UPDATE public.banco_movimientos SET revision_motivo = 'Conciliación automática deshecha' WHERE id = r.id;
    v_n := v_n + 1;
    IF v_res->>'anulada' IS NOT NULL THEN v_anuladas := v_anuladas + 1; END IF;

    d := NULL;
    SELECT x INTO d FROM jsonb_array_elements(l.detalle) x
    WHERE x->>'movimiento_id' = r.id::text AND x->>'accion' = 'conciliar' AND coalesce((x->>'tf_asignado')::boolean, false) LIMIT 1;
    IF d IS NOT NULL AND d ? 'solicitud_id' THEN
      v_tf := d->>'secuencia'; v_ok := 0;
      BEGIN
        IF d->>'origen_tipo' = 'transporte' THEN
          UPDATE public.solicitudes_pago_transporte SET numero_control = d->>'numero_anterior', tf_retroactivo = false
          WHERE id = (d->>'solicitud_id')::uuid AND numero_control = v_tf;
          GET DIAGNOSTICS v_ok = ROW_COUNT;
          IF v_ok > 0 THEN
            UPDATE public.transportes t SET numero_control_pago = x.numero_control_pago
            FROM jsonb_to_recordset(coalesce(d->'viajes_anteriores', '[]'::jsonb)) AS x(id uuid, numero_control_pago text)
            WHERE t.id = x.id AND private.normalizar_tf(t.numero_control_pago) = v_tf;
          END IF;
        ELSE
          UPDATE public.solicitudes_pago_transferencia SET secuencia = d->>'numero_anterior', tf_retroactivo = false
          WHERE id = (d->>'solicitud_id')::uuid AND secuencia = v_tf;
          GET DIAGNOSTICS v_ok = ROW_COUNT;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_ok := 0;
      END;
      IF v_ok > 0 THEN
        INSERT INTO public.tf_sin_uso_notas(secuencia, nota, reutilizar, liberado_en, liberado_de)
        VALUES (v_tf, 'Liberado al deshacer la conciliación automática del ' || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY')
          || ' (lo tenía ' || coalesce(d->>'numero_anterior', 'una entrada') || ' · ' || coalesce(d->>'beneficiario', '') || '). Se reutiliza primero.',
          true, now(), d->>'numero_anterior')
        ON CONFLICT (secuencia) DO UPDATE SET reutilizar = true, liberado_en = now(), liberado_de = EXCLUDED.liberado_de,
          nota = CASE WHEN coalesce(trim(public.tf_sin_uso_notas.nota), '') = '' THEN EXCLUDED.nota ELSE public.tf_sin_uso_notas.nota END;
        v_liberados := v_liberados || v_tf;
        INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
        VALUES (CASE WHEN d->>'origen_tipo' = 'transporte' THEN 'solicitudes_pago_transporte' ELSE 'solicitudes_pago_transferencia' END,
          (d->>'solicitud_id')::uuid, 'TF_LIBERADO', v_uid, jsonb_build_object('tf', v_tf, 'numero_restaurado', d->>'numero_anterior', 'lote_automatico', p_lote));
      END IF;
    END IF;
  END LOOP;
  UPDATE public.banco_lotes_automaticos SET deshecho_en = now(), deshecho_por = v_uid, deshechos = v_n, tf_liberados = v_liberados WHERE id = p_lote;
  INSERT INTO public.auditoria(entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('banco_lote_conciliacion', p_lote, 'LOTE_CONCILIACION_AUTOMATICA_DESHECHO', v_uid,
    jsonb_build_object('deshechos', v_n, 'anuladas', v_anuladas, 'tf_liberados', v_liberados, 'motivo', nullif(trim(p_motivo), '')));
  RETURN jsonb_build_object('deshechos', v_n, 'anuladas', v_anuladas, 'tf_liberados', v_liberados);
END $$;

REVOKE ALL ON FUNCTION public.conciliar_automatico_importacion(jsonb, jsonb, text, boolean, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliar_automatico_importacion(jsonb, jsonb, text, boolean, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.deshacer_lote_automatico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_automatico(uuid, text) TO authenticated;