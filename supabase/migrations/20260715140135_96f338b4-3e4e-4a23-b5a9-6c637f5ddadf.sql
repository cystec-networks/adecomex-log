
-- ============================================================
-- PARTE 1: nuevos campos en facturas_ecf
-- ============================================================
ALTER TABLE public.facturas_ecf
  ADD COLUMN IF NOT EXISTS forma_pago_venta text,
  ADD COLUMN IF NOT EXISTS tipo_ingreso text NOT NULL DEFAULT 'operaciones',
  ADD COLUMN IF NOT EXISTS tasa_itbis numeric NOT NULL DEFAULT 18;

ALTER TABLE public.facturas_ecf
  DROP CONSTRAINT IF EXISTS facturas_ecf_forma_pago_venta_check,
  DROP CONSTRAINT IF EXISTS facturas_ecf_tipo_ingreso_check,
  DROP CONSTRAINT IF EXISTS facturas_ecf_tasa_itbis_check;

ALTER TABLE public.facturas_ecf
  ADD CONSTRAINT facturas_ecf_forma_pago_venta_check
    CHECK (forma_pago_venta IS NULL OR forma_pago_venta IN
      ('efectivo','cheque_transferencia','tarjeta','credito','bonos_certificados','permuta','otras')),
  ADD CONSTRAINT facturas_ecf_tipo_ingreso_check
    CHECK (tipo_ingreso IN
      ('operaciones','financieros','extraordinarios','arrendamientos','venta_activos_depreciables','otros')),
  ADD CONSTRAINT facturas_ecf_tasa_itbis_check
    CHECK (tasa_itbis IN (0,8,9,16,18));

-- ============================================================
-- PARTE 2: itbis_retenciones_recibidas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.itbis_retenciones_recibidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  tipo text NOT NULL,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  cliente_o_agente text,
  referencia text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itbis_ret_recibidas_periodo_check CHECK (periodo ~ '^[0-9]{6}$'),
  CONSTRAINT itbis_ret_recibidas_tipo_check CHECK (tipo IN
    ('norma_08_04','bsp_iata','otras_norma_02_05','credito_retencion_estado','itbis_percibido'))
);
CREATE INDEX IF NOT EXISTS itbis_ret_recibidas_periodo_idx
  ON public.itbis_retenciones_recibidas(periodo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itbis_retenciones_recibidas TO authenticated;
GRANT ALL ON public.itbis_retenciones_recibidas TO service_role;

ALTER TABLE public.itbis_retenciones_recibidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itbis_ret_recibidas_select ON public.itbis_retenciones_recibidas;
DROP POLICY IF EXISTS itbis_ret_recibidas_insert ON public.itbis_retenciones_recibidas;
DROP POLICY IF EXISTS itbis_ret_recibidas_update ON public.itbis_retenciones_recibidas;
DROP POLICY IF EXISTS itbis_ret_recibidas_delete ON public.itbis_retenciones_recibidas;

CREATE POLICY itbis_ret_recibidas_select ON public.itbis_retenciones_recibidas
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_ret_recibidas_insert ON public.itbis_retenciones_recibidas
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_ret_recibidas_update ON public.itbis_retenciones_recibidas
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_ret_recibidas_delete ON public.itbis_retenciones_recibidas
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS touch_itbis_ret_recibidas ON public.itbis_retenciones_recibidas;
CREATE TRIGGER touch_itbis_ret_recibidas BEFORE UPDATE ON public.itbis_retenciones_recibidas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_itbis_ret_recibidas ON public.itbis_retenciones_recibidas;
CREATE TRIGGER audit_itbis_ret_recibidas AFTER INSERT OR UPDATE OR DELETE
  ON public.itbis_retenciones_recibidas
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- ============================================================
-- PARTE 3: itbis_declaraciones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.itbis_declaraciones (
  periodo text PRIMARY KEY,
  saldo_favor_anterior numeric(14,2) NOT NULL DEFAULT 0,
  recargos numeric(14,2) NOT NULL DEFAULT 0,
  interes_indemnizatorio numeric(14,2) NOT NULL DEFAULT 0,
  sanciones numeric(14,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'borrador',
  fecha_presentada timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itbis_declaraciones_periodo_check CHECK (periodo ~ '^[0-9]{6}$'),
  CONSTRAINT itbis_declaraciones_estado_check CHECK (estado IN ('borrador','presentada'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itbis_declaraciones TO authenticated;
GRANT ALL ON public.itbis_declaraciones TO service_role;

ALTER TABLE public.itbis_declaraciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itbis_declaraciones_select ON public.itbis_declaraciones;
DROP POLICY IF EXISTS itbis_declaraciones_insert ON public.itbis_declaraciones;
DROP POLICY IF EXISTS itbis_declaraciones_update ON public.itbis_declaraciones;
DROP POLICY IF EXISTS itbis_declaraciones_delete ON public.itbis_declaraciones;

CREATE POLICY itbis_declaraciones_select ON public.itbis_declaraciones
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_declaraciones_insert ON public.itbis_declaraciones
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_declaraciones_update ON public.itbis_declaraciones
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY itbis_declaraciones_delete ON public.itbis_declaraciones
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS touch_itbis_declaraciones ON public.itbis_declaraciones;
CREATE TRIGGER touch_itbis_declaraciones BEFORE UPDATE ON public.itbis_declaraciones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_itbis_declaraciones ON public.itbis_declaraciones;
CREATE TRIGGER audit_itbis_declaraciones AFTER INSERT OR UPDATE OR DELETE
  ON public.itbis_declaraciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- ============================================================
-- PARTE 4: función pública calc_itbis_periodo(text) -> jsonb
-- ============================================================
CREATE OR REPLACE FUNCTION public.calc_itbis_periodo(_periodo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();

  -- ventas
  v_total_operaciones numeric := 0;
  v_total_gravadas numeric := 0;
  v_total_no_gravadas numeric := 0;
  v_gravadas_18 numeric := 0;
  v_gravadas_16 numeric := 0;
  v_gravadas_9  numeric := 0;
  v_gravadas_8  numeric := 0;
  v_itbis_cobrado numeric := 0;
  v_forma_pago jsonb := '{}'::jsonb;
  v_tipo_ingreso jsonb := '{}'::jsonb;
  v_anexo_a jsonb := '{}'::jsonb;

  -- compras
  c_itbis_adelantar_bienes numeric := 0;
  c_itbis_adelantar_servicios numeric := 0;
  c_itbis_proporcionalidad numeric := 0;
  c_coeficiente numeric := 0;
  c_itbis_admitido_prop numeric := 0;
  c_deducible_total numeric := 0;

  -- retenciones/percepciones recibidas
  r_norma_08_04 numeric := 0;
  r_bsp_iata numeric := 0;
  r_otras_norma_02_05 numeric := 0;
  r_credito_retencion_estado numeric := 0;
  r_itbis_percibido numeric := 0;
  r_total_pagos_computables numeric := 0;

  -- declaración
  d_saldo_favor_anterior numeric := 0;
  d_recargos numeric := 0;
  d_interes numeric := 0;
  d_sanciones numeric := 0;
  d_estado text := 'borrador';

  imp_a_pagar numeric := 0;
  diferencia_final numeric := 0;
BEGIN
  IF NOT private.has_any_role(_uid, ARRAY['admin'::app_role,'finanzas'::app_role,'contabilidad'::app_role]) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _periodo !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Período inválido, se espera AAAAMM';
  END IF;

  -- ============= VENTAS =============
  SELECT
    COALESCE(SUM(subtotal_gravado + subtotal_exento),0),
    COALESCE(SUM(subtotal_gravado),0),
    COALESCE(SUM(subtotal_exento),0),
    COALESCE(SUM(CASE WHEN tasa_itbis = 18 THEN subtotal_gravado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tasa_itbis = 16 THEN subtotal_gravado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tasa_itbis =  9 THEN subtotal_gravado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tasa_itbis =  8 THEN subtotal_gravado ELSE 0 END),0),
    COALESCE(SUM(total_itbis),0)
  INTO
    v_total_operaciones, v_total_gravadas, v_total_no_gravadas,
    v_gravadas_18, v_gravadas_16, v_gravadas_9, v_gravadas_8,
    v_itbis_cobrado
  FROM public.facturas_ecf
  WHERE eliminado_en IS NULL
    AND to_char(fecha_emision,'YYYYMM') = _periodo;

  -- por forma de pago
  SELECT COALESCE(jsonb_object_agg(fp, monto), '{}'::jsonb) INTO v_forma_pago
  FROM (
    SELECT COALESCE(forma_pago_venta,'sin_dato') AS fp,
           SUM(subtotal_gravado + subtotal_exento + total_itbis) AS monto
    FROM public.facturas_ecf
    WHERE eliminado_en IS NULL AND to_char(fecha_emision,'YYYYMM') = _periodo
    GROUP BY 1
  ) t;

  -- por tipo de ingreso
  SELECT COALESCE(jsonb_object_agg(ti, monto), '{}'::jsonb) INTO v_tipo_ingreso
  FROM (
    SELECT COALESCE(tipo_ingreso,'operaciones') AS ti,
           SUM(subtotal_gravado + subtotal_exento) AS monto
    FROM public.facturas_ecf
    WHERE eliminado_en IS NULL AND to_char(fecha_emision,'YYYYMM') = _periodo
    GROUP BY 1
  ) t;

  -- Anexo A: por tipo de comprobante, mapeando 31/01, 32/02, etc.
  SELECT COALESCE(jsonb_object_agg(grupo, jsonb_build_object('cantidad', cnt, 'monto', monto, 'itbis', itbis)), '{}'::jsonb)
  INTO v_anexo_a
  FROM (
    SELECT
      CASE tipo_comprobante
        WHEN '31' THEN 'credito_fiscal'  WHEN '01' THEN 'credito_fiscal'
        WHEN '32' THEN 'consumo'         WHEN '02' THEN 'consumo'
        WHEN '33' THEN 'nota_debito'     WHEN '03' THEN 'nota_debito'
        WHEN '34' THEN 'nota_credito'    WHEN '04' THEN 'nota_credito'
        WHEN '44' THEN 'regimenes_especiales' WHEN '14' THEN 'regimenes_especiales'
        WHEN '45' THEN 'gubernamentales' WHEN '15' THEN 'gubernamentales'
        WHEN '46' THEN 'exportaciones'   WHEN '16' THEN 'exportaciones'
        ELSE 'otros'
      END AS grupo,
      COUNT(*)::int AS cnt,
      SUM(CASE WHEN tipo_comprobante IN ('34','04') THEN -(subtotal_gravado + subtotal_exento) ELSE (subtotal_gravado + subtotal_exento) END) AS monto,
      SUM(CASE WHEN tipo_comprobante IN ('34','04') THEN -total_itbis ELSE total_itbis END) AS itbis
    FROM public.facturas_ecf
    WHERE eliminado_en IS NULL AND to_char(fecha_emision,'YYYYMM') = _periodo
    GROUP BY 1
  ) t;

  -- ============= COMPRAS (gastos + gastos_operativos) =============
  WITH todas AS (
    SELECT itbis_facturado, itbis_retenido, itbis_proporcionalidad_349,
           itbis_llevado_costo, itbis_percibido_compras, tipo_bienes_servicios
    FROM public.gastos
    WHERE deleted_at IS NULL AND fecha IS NOT NULL
      AND to_char(fecha,'YYYYMM') = _periodo
    UNION ALL
    SELECT itbis_facturado, itbis_retenido, itbis_proporcionalidad_349,
           itbis_llevado_costo, itbis_percibido_compras, tipo_bienes_servicios
    FROM public.gastos_operativos
    WHERE eliminado_en IS NULL AND fecha IS NOT NULL
      AND to_char(fecha,'YYYYMM') = _periodo
  )
  SELECT
    COALESCE(SUM(CASE WHEN tipo_bienes_servicios IN (9,10)
      THEN GREATEST(itbis_facturado - itbis_retenido - itbis_proporcionalidad_349 - itbis_llevado_costo, 0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tipo_bienes_servicios IN (2,3,5,6,7,8,11)
      THEN GREATEST(itbis_facturado - itbis_retenido - itbis_proporcionalidad_349 - itbis_llevado_costo, 0) ELSE 0 END),0),
    COALESCE(SUM(itbis_proporcionalidad_349),0)
  INTO c_itbis_adelantar_bienes, c_itbis_adelantar_servicios, c_itbis_proporcionalidad
  FROM todas;

  -- coeficiente proporcionalidad
  IF v_total_operaciones > 0 THEN
    c_coeficiente := ROUND((v_total_no_gravadas / v_total_operaciones) * 100, 6);
  END IF;
  c_itbis_admitido_prop := ROUND(c_itbis_proporcionalidad * c_coeficiente / 100, 2);

  c_deducible_total := c_itbis_adelantar_bienes + c_itbis_adelantar_servicios + c_itbis_admitido_prop;

  -- ============= RETENCIONES RECIBIDAS =============
  SELECT
    COALESCE(SUM(CASE WHEN tipo='norma_08_04' THEN monto ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tipo='bsp_iata' THEN monto ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tipo='otras_norma_02_05' THEN monto ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tipo='credito_retencion_estado' THEN monto ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN tipo='itbis_percibido' THEN monto ELSE 0 END),0)
  INTO r_norma_08_04, r_bsp_iata, r_otras_norma_02_05,
       r_credito_retencion_estado, r_itbis_percibido
  FROM public.itbis_retenciones_recibidas
  WHERE periodo = _periodo;

  r_total_pagos_computables := r_norma_08_04 + r_bsp_iata + r_otras_norma_02_05
                              + r_credito_retencion_estado + r_itbis_percibido;

  -- ============= DECLARACIÓN =============
  SELECT saldo_favor_anterior, recargos, interes_indemnizatorio, sanciones, estado
    INTO d_saldo_favor_anterior, d_recargos, d_interes, d_sanciones, d_estado
  FROM public.itbis_declaraciones WHERE periodo = _periodo;

  d_saldo_favor_anterior := COALESCE(d_saldo_favor_anterior,0);
  d_recargos := COALESCE(d_recargos,0);
  d_interes := COALESCE(d_interes,0);
  d_sanciones := COALESCE(d_sanciones,0);
  d_estado := COALESCE(d_estado,'borrador');

  imp_a_pagar := v_itbis_cobrado - c_deducible_total;
  diferencia_final := imp_a_pagar - d_saldo_favor_anterior - r_total_pagos_computables;

  RETURN jsonb_build_object(
    'periodo', _periodo,
    'ventas', jsonb_build_object(
      'total_operaciones', v_total_operaciones,
      'total_gravadas', v_total_gravadas,
      'total_no_gravadas', v_total_no_gravadas,
      'gravadas_por_tasa', jsonb_build_object(
        '18', v_gravadas_18, '16', v_gravadas_16, '9', v_gravadas_9, '8', v_gravadas_8
      ),
      'itbis_cobrado', v_itbis_cobrado,
      'por_forma_pago', v_forma_pago,
      'por_tipo_ingreso', v_tipo_ingreso,
      'anexo_a_por_tipo', v_anexo_a
    ),
    'compras', jsonb_build_object(
      'itbis_adelantar_bienes', c_itbis_adelantar_bienes,
      'itbis_adelantar_servicios', c_itbis_adelantar_servicios,
      'itbis_sujeto_proporcionalidad', c_itbis_proporcionalidad,
      'coeficiente_proporcionalidad', c_coeficiente,
      'itbis_admitido_proporcionalidad', c_itbis_admitido_prop,
      'itbis_deducible_total', c_deducible_total
    ),
    'retenciones_recibidas', jsonb_build_object(
      'norma_08_04', r_norma_08_04,
      'bsp_iata', r_bsp_iata,
      'otras_norma_02_05', r_otras_norma_02_05,
      'credito_retencion_estado', r_credito_retencion_estado,
      'itbis_percibido', r_itbis_percibido,
      'total_pagos_computables', r_total_pagos_computables
    ),
    'declaracion', jsonb_build_object(
      'saldo_favor_anterior', d_saldo_favor_anterior,
      'recargos', d_recargos,
      'interes_indemnizatorio', d_interes,
      'sanciones', d_sanciones,
      'estado', d_estado
    ),
    'resultado', jsonb_build_object(
      'impuesto_a_pagar_o_saldo_favor', imp_a_pagar,
      'diferencia_a_pagar_final', diferencia_final
    ),
    'constructoras_comisionistas', jsonb_build_object(
      'aplica', false,
      'total', 0
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calc_itbis_periodo(text) FROM public;
GRANT EXECUTE ON FUNCTION public.calc_itbis_periodo(text) TO authenticated;
