ALTER TABLE public.facturas_ecf_lineas ADD COLUMN IF NOT EXISTS tipo_concepto text
  CHECK (tipo_concepto IS NULL OR tipo_concepto IN ('gestion_aduanal','transporte','reembolso','otros'));

UPDATE public.facturas_ecf_lineas SET tipo_concepto = CASE
  WHEN lower(translate(coalesce(descripcion,''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')) ~ 'reembolso' THEN 'reembolso'
  WHEN lower(translate(coalesce(descripcion,''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')) ~ '(transporte|flete|retorno|demora)' THEN 'transporte'
  WHEN lower(translate(coalesce(descripcion,''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')) ~ '(gestion|aduanal|vuce|honorario)' THEN 'gestion_aduanal'
  ELSE 'otros' END
WHERE tipo_concepto IS NULL;

CREATE TABLE public.facturas_ecf_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.facturas_ecf(id) ON DELETE CASCADE,
  linea_id uuid NOT NULL REFERENCES public.facturas_ecf_lineas(id) ON DELETE CASCADE,
  expediente_id uuid REFERENCES public.expedientes(id),
  transporte_id uuid REFERENCES public.transportes(id),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','escaneo','migrado')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facturas_ecf_asignaciones_un_destino CHECK ((expediente_id IS NULL) <> (transporte_id IS NULL))
);
CREATE INDEX facturas_ecf_asignaciones_factura_idx ON public.facturas_ecf_asignaciones(factura_id);
CREATE INDEX facturas_ecf_asignaciones_expediente_idx ON public.facturas_ecf_asignaciones(expediente_id);
CREATE INDEX facturas_ecf_asignaciones_transporte_idx ON public.facturas_ecf_asignaciones(transporte_id);
CREATE UNIQUE INDEX facturas_ecf_asignaciones_linea_exp_uq ON public.facturas_ecf_asignaciones(linea_id, expediente_id) WHERE expediente_id IS NOT NULL;
CREATE UNIQUE INDEX facturas_ecf_asignaciones_linea_tr_uq ON public.facturas_ecf_asignaciones(linea_id, transporte_id) WHERE transporte_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_ecf_asignaciones TO authenticated;
GRANT ALL ON public.facturas_ecf_asignaciones TO service_role;
ALTER TABLE public.facturas_ecf_asignaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asignaciones ecf lectura personal" ON public.facturas_ecf_asignaciones FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "asignaciones ecf escritura contabilidad" ON public.facturas_ecf_asignaciones FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));

-- Una factura puede ir a varios Transportes (una sola vez por Transporte).
ALTER TABLE public.transporte_facturas_ecf DROP CONSTRAINT IF EXISTS transporte_facturas_ecf_factura_ecf_id_key;
ALTER TABLE public.transporte_facturas_ecf ADD CONSTRAINT transporte_facturas_ecf_par_key UNIQUE (transporte_id, factura_ecf_id);

CREATE OR REPLACE FUNCTION public.agregar_factura_transporte(_transporte_id uuid, _factura_id uuid, _numero text, _detalle text)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_t public.transportes;
BEGIN
  SELECT * INTO v_t FROM public.transportes WHERE id = _transporte_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND OR v_t.numero_viaje IS DISTINCT FROM _numero OR v_t.contenedores_detalle IS DISTINCT FROM _detalle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.facturas_ecf WHERE id = _factura_id AND eliminado_en IS NULL) THEN RETURN false; END IF;
  -- Vinculación automática: nunca añade un segundo Transporte a una factura ya vinculada.
  IF EXISTS (SELECT 1 FROM public.transporte_facturas_ecf WHERE factura_ecf_id = _factura_id AND transporte_id <> _transporte_id) THEN RETURN false; END IF;
  INSERT INTO public.transporte_facturas_ecf(transporte_id, factura_ecf_id) VALUES (_transporte_id, _factura_id) ON CONFLICT DO NOTHING;
  RETURN EXISTS (SELECT 1 FROM public.transporte_facturas_ecf WHERE transporte_id = _transporte_id AND factura_ecf_id = _factura_id);
END $function$;

CREATE OR REPLACE FUNCTION public.importe_ecf_transporte(p_factura uuid, p_transporte uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM public.facturas_ecf_asignaciones a WHERE a.factura_id = f.id)
    THEN COALESCE((SELECT sum(a.monto) FROM public.facturas_ecf_asignaciones a WHERE a.factura_id = f.id AND a.transporte_id = p_transporte), 0)
  WHEN f.vinculo_por_linea
    THEN COALESCE((SELECT sum(l.valor + COALESCE(l.itbis,0)) FROM public.facturas_ecf_lineas l WHERE l.factura_id = f.id AND l.transporte_id = p_transporte), 0)
  ELSE f.monto_total END
FROM public.facturas_ecf f WHERE f.id = p_factura AND f.eliminado_en IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_hito_factura_venta(p_expediente uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF p_expediente IS NULL THEN RETURN false; END IF;
  SELECT e.id, e.encf, e.fecha_emision INTO r FROM public.facturas_ecf e
   WHERE e.eliminado_en IS NULL AND e.fecha_anulacion IS NULL AND COALESCE(e.estado, '') NOT ILIKE 'anulad%'
     AND e.fecha_emision IS NOT NULL AND right(COALESCE(e.tipo_comprobante, ''), 2) IN ('31', '32', '44', '45', '46')
     AND (EXISTS (SELECT 1 FROM public.facturas f WHERE f.factura_ecf_id = e.id AND f.expediente_id = p_expediente AND f.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.facturas_ecf_lineas l WHERE l.factura_id = e.id AND l.expediente_id = p_expediente)
       OR EXISTS (SELECT 1 FROM public.facturas_ecf_asignaciones a WHERE a.factura_id = e.id AND a.expediente_id = p_expediente))
   ORDER BY e.fecha_emision, e.created_at LIMIT 1;
  IF FOUND THEN
    RETURN public.aplicar_hito_automatico(p_expediente, 'factura_venta_enviada', 'ecf',
      public.fecha_dia_sd(r.fecha_emision), jsonb_build_object('encf', r.encf), r.id, true);
  END IF;
  RETURN public.aplicar_hito_automatico(p_expediente, 'factura_venta_enviada', 'ecf', NULL, NULL, NULL, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_vinculos_factura_ecf(p_factura uuid, p_tipos jsonb, p_asignaciones jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_f public.facturas_ecf%ROWTYPE;
  v_l public.facturas_ecf_lineas%ROWTYPE;
  v_usuario text;
  j jsonb;
  v_exp uuid; v_tr uuid; v_monto numeric; v_total numeric;
  v_old_exp uuid[]; v_old_tr uuid[]; v_new_exp uuid[]; v_new_tr uuid[]; v_quit_exp uuid[]; v_quit_tr uuid[];
  v_old_montos jsonb; v_new_montos jsonb;
  v_id uuid; v_estado text; v_num text; v_hay boolean;
BEGIN
  IF v_uid IS NULL OR NOT private.has_any_role(v_uid, ARRAY['admin'::app_role, 'contabilidad'::app_role]) THEN
    RAISE EXCEPTION 'No tienes permiso para vincular facturas' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_asignaciones, '[]'::jsonb)) <> 'array' OR jsonb_typeof(COALESCE(p_tipos, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Datos de vinculación inválidos';
  END IF;
  SELECT * INTO v_f FROM public.facturas_ecf WHERE id = p_factura AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La factura ya no existe; recarga la página'; END IF;
  SELECT nombre INTO v_usuario FROM public.profiles WHERE id = v_uid;

  FOR j IN SELECT value FROM jsonb_array_elements(COALESCE(p_tipos, '[]'::jsonb)) LOOP
    IF COALESCE(j->>'tipo', '') NOT IN ('gestion_aduanal','transporte','reembolso','otros') THEN RAISE EXCEPTION 'Tipo de renglón inválido'; END IF;
    UPDATE public.facturas_ecf_lineas SET tipo_concepto = j->>'tipo'
     WHERE id = (j->>'linea_id')::uuid AND factura_id = p_factura AND tipo_concepto IS DISTINCT FROM j->>'tipo';
  END LOOP;

  -- Destinos anteriores: montos asignados y vínculos antiguos.
  SELECT COALESCE(array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL), '{}') INTO v_old_exp FROM (
    SELECT expediente_id x FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura
    UNION SELECT id FROM public.expedientes WHERE factura_ecf_id = p_factura AND eliminado_en IS NULL
    UNION SELECT expediente_id FROM public.facturas_ecf_lineas WHERE factura_id = p_factura) s;
  SELECT COALESCE(array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL), '{}') INTO v_old_tr FROM (
    SELECT transporte_id x FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura
    UNION SELECT transporte_id FROM public.transporte_facturas_ecf WHERE factura_ecf_id = p_factura
    UNION SELECT transporte_id FROM public.facturas_ecf_lineas WHERE factura_id = p_factura) s;
  SELECT COALESCE(jsonb_object_agg(k, m), '{}'::jsonb) INTO v_old_montos FROM (
    SELECT COALESCE(expediente_id, transporte_id)::text k, sum(monto) m FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura GROUP BY 1) s;

  DELETE FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura;

  FOR j IN SELECT value FROM jsonb_array_elements(COALESCE(p_asignaciones, '[]'::jsonb)) LOOP
    v_exp := NULLIF(j->>'expediente_id', '')::uuid;
    v_tr := NULLIF(j->>'transporte_id', '')::uuid;
    v_monto := round((j->>'monto')::numeric, 2);
    SELECT * INTO v_l FROM public.facturas_ecf_lineas WHERE id = NULLIF(j->>'linea_id', '')::uuid AND factura_id = p_factura;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un renglón ya no pertenece a la factura; recarga la página'; END IF;
    IF (v_exp IS NULL) = (v_tr IS NULL) THEN RAISE EXCEPTION 'Cada monto asignado necesita un Expediente o un Transporte'; END IF;
    IF v_monto IS NULL OR v_monto <= 0 THEN RAISE EXCEPTION 'Monto asignado inválido en el renglón %', v_l.orden; END IF;
    IF v_tr IS NOT NULL THEN
      IF COALESCE(v_l.tipo_concepto, '') <> 'transporte' THEN
        RAISE EXCEPTION 'El renglón % no es de transporte: a un Transporte solo se le asignan renglones de transporte, nunca gestión aduanal', v_l.orden;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.transportes WHERE id = v_tr AND eliminado_en IS NULL) THEN RAISE EXCEPTION 'Transporte no disponible'; END IF;
    ELSE
      SELECT estado::text, numero INTO v_estado, v_num FROM public.expedientes WHERE id = v_exp AND eliminado_en IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no disponible'; END IF;
      IF v_estado = 'completado' AND NOT (v_exp = ANY(v_old_exp)) THEN
        RAISE EXCEPTION 'El Expediente % está Completado: reábrelo para vincularle la factura', v_num;
      END IF;
    END IF;
    INSERT INTO public.facturas_ecf_asignaciones(factura_id, linea_id, expediente_id, transporte_id, monto, origen, created_by)
    VALUES (p_factura, v_l.id, v_exp, v_tr, v_monto,
      CASE WHEN j->>'origen' IN ('manual','escaneo','migrado') THEN j->>'origen' ELSE 'manual' END, v_uid);
  END LOOP;

  v_hay := EXISTS (SELECT 1 FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura);
  IF v_hay THEN
    IF EXISTS (SELECT 1 FROM public.facturas_ecf_lineas l
                LEFT JOIN (SELECT linea_id, sum(monto) s FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura GROUP BY 1) a ON a.linea_id = l.id
               WHERE l.factura_id = p_factura AND abs(COALESCE(a.s, 0) - round(l.valor + COALESCE(l.itbis, 0), 2)) > 0.01) THEN
      RAISE EXCEPTION 'Los montos asignados deben cubrir exactamente cada renglón de la factura';
    END IF;
    SELECT sum(monto) INTO v_total FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura;
    IF abs(v_total - v_f.monto_total) > 0.01 THEN
      RAISE EXCEPTION 'Los montos asignados (RD$ %) deben sumar exactamente el total de la factura (RD$ %)', v_total, v_f.monto_total;
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT expediente_id) FILTER (WHERE expediente_id IS NOT NULL), '{}'),
         COALESCE(array_agg(DISTINCT transporte_id) FILTER (WHERE transporte_id IS NOT NULL), '{}')
    INTO v_new_exp, v_new_tr FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura;
  SELECT COALESCE(jsonb_object_agg(k, m), '{}'::jsonb) INTO v_new_montos FROM (
    SELECT COALESCE(expediente_id, transporte_id)::text k, sum(monto) m FROM public.facturas_ecf_asignaciones WHERE factura_id = p_factura GROUP BY 1) s;
  v_quit_exp := ARRAY(SELECT unnest(v_old_exp) EXCEPT SELECT unnest(v_new_exp));
  v_quit_tr := ARRAY(SELECT unnest(v_old_tr) EXCEPT SELECT unnest(v_new_tr));

  FOREACH v_id IN ARRAY v_quit_exp LOOP
    SELECT estado::text, numero INTO v_estado, v_num FROM public.expedientes WHERE id = v_id;
    IF v_estado = 'completado' THEN RAISE EXCEPTION 'El Expediente % está Completado: reábrelo para desvincular la factura', v_num; END IF;
  END LOOP;

  -- Destino del renglón (solo cuando va completo a un único destino).
  UPDATE public.facturas_ecf_lineas l SET expediente_id = s.e, transporte_id = s.t
    FROM (SELECT l2.id,
                 CASE WHEN count(a.id) = 1 THEN (array_agg(a.expediente_id))[1] END e,
                 CASE WHEN count(a.id) = 1 THEN (array_agg(a.transporte_id))[1] END t
            FROM public.facturas_ecf_lineas l2 LEFT JOIN public.facturas_ecf_asignaciones a ON a.linea_id = l2.id
           WHERE l2.factura_id = p_factura GROUP BY l2.id) s
   WHERE l.id = s.id AND (l.expediente_id IS DISTINCT FROM s.e OR l.transporte_id IS DISTINCT FROM s.t);
  UPDATE public.facturas_ecf SET vinculo_por_linea = v_hay WHERE id = p_factura AND vinculo_por_linea IS DISTINCT FROM v_hay;

  DELETE FROM public.transporte_facturas_ecf WHERE factura_ecf_id = p_factura AND NOT (transporte_id = ANY(v_new_tr));
  INSERT INTO public.transporte_facturas_ecf(transporte_id, factura_ecf_id, created_by)
    SELECT t, p_factura, v_uid FROM unnest(v_new_tr) t ON CONFLICT DO NOTHING;
  UPDATE public.transportes SET ingreso_facturado = ingreso_facturado WHERE id = ANY(v_new_tr);

  UPDATE public.expedientes SET factura_ecf_id = p_factura WHERE id = ANY(v_new_exp) AND factura_ecf_id IS NULL;
  UPDATE public.expedientes e SET factura_ecf_id = (
      SELECT a.factura_id FROM public.facturas_ecf_asignaciones a JOIN public.facturas_ecf f ON f.id = a.factura_id AND f.eliminado_en IS NULL
       WHERE a.expediente_id = e.id ORDER BY f.fecha_emision, f.created_at LIMIT 1)
   WHERE e.id = ANY(v_quit_exp) AND e.factura_ecf_id = p_factura;

  -- Auditoría legible en cada destino.
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'expedientes', d, CASE WHEN d = ANY(v_old_exp) THEN 'factura_ecf_monto_cambiado' ELSE 'factura_ecf_vinculada' END, v_uid,
         jsonb_build_object('factura_id', p_factura, 'encf', v_f.encf, 'destino', (SELECT numero FROM public.expedientes WHERE id = d),
           'monto', v_new_montos->(d::text), 'monto_anterior', v_old_montos->(d::text), 'usuario', v_usuario)
    FROM unnest(v_new_exp) d
   WHERE NOT (d = ANY(v_old_exp)) OR (v_old_montos->(d::text)) IS DISTINCT FROM (v_new_montos->(d::text));
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'expedientes', d, 'factura_ecf_desvinculada', v_uid,
         jsonb_build_object('factura_id', p_factura, 'encf', v_f.encf, 'destino', (SELECT numero FROM public.expedientes WHERE id = d),
           'monto_anterior', v_old_montos->(d::text), 'usuario', v_usuario)
    FROM unnest(v_quit_exp) d;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'transportes', d, CASE WHEN d = ANY(v_old_tr) THEN 'factura_ecf_monto_cambiado' ELSE 'factura_ecf_vinculada' END, v_uid,
         jsonb_build_object('factura_id', p_factura, 'encf', v_f.encf, 'destino', (SELECT numero_viaje FROM public.transportes WHERE id = d),
           'monto', v_new_montos->(d::text), 'monto_anterior', v_old_montos->(d::text), 'usuario', v_usuario)
    FROM unnest(v_new_tr) d
   WHERE NOT (d = ANY(v_old_tr)) OR (v_old_montos->(d::text)) IS DISTINCT FROM (v_new_montos->(d::text));
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  SELECT 'transportes', d, 'factura_ecf_desvinculada', v_uid,
         jsonb_build_object('factura_id', p_factura, 'encf', v_f.encf, 'destino', (SELECT numero_viaje FROM public.transportes WHERE id = d),
           'monto_anterior', v_old_montos->(d::text), 'usuario', v_usuario)
    FROM unnest(v_quit_tr) d;

  FOREACH v_id IN ARRAY (v_new_exp || v_quit_exp) LOOP
    PERFORM public.recalcular_hito_factura_venta(v_id);
  END LOOP;

  RETURN jsonb_build_object('expedientes', to_jsonb(v_new_exp), 'expedientes_quitados', to_jsonb(v_quit_exp),
    'transportes', to_jsonb(v_new_tr), 'transportes_quitados', to_jsonb(v_quit_tr));
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_vinculos_factura_ecf(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_vinculos_factura_ecf(uuid, jsonb, jsonb) TO authenticated, service_role;