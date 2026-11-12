-- Lotes reversibles de fechas retroactivas del Checklist de Despacho.
CREATE TABLE IF NOT EXISTS public.hitos_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_por uuid,
  total integer NOT NULL DEFAULT 0,
  deshecho_en timestamptz,
  deshecho_por uuid,
  revertidos integer,
  conservados integer
);
GRANT SELECT ON public.hitos_lotes TO authenticated;
GRANT ALL ON public.hitos_lotes TO service_role;
ALTER TABLE public.hitos_lotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin lee lotes de hitos" ON public.hitos_lotes;
CREATE POLICY "Admin lee lotes de hitos" ON public.hitos_lotes
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.hitos_lote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.hitos_lotes(id) ON DELETE CASCADE,
  hito_id uuid NOT NULL REFERENCES public.expediente_hitos(id) ON DELETE CASCADE,
  expediente_id uuid NOT NULL,
  hito_codigo text NOT NULL,
  origen text NOT NULL,
  fecha date NOT NULL,
  evento_fecha timestamptz NOT NULL,
  prev_estado public.hito_estado NOT NULL DEFAULT 'pendiente',
  revertido boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS hitos_lote_items_lote_idx ON public.hitos_lote_items (lote_id);
GRANT SELECT ON public.hitos_lote_items TO authenticated;
GRANT ALL ON public.hitos_lote_items TO service_role;
ALTER TABLE public.hitos_lote_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin lee items de lotes de hitos" ON public.hitos_lote_items;
CREATE POLICY "Admin lee items de lotes de hitos" ON public.hitos_lote_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Hitos 1, 2, 4 y 8 vacíos (nunca tocados a mano) con la fecha que les asignaría su regla automática. Solo admin.
CREATE OR REPLACE FUNCTION public.hitos_retroactivos_candidatos()
RETURNS TABLE(hito_id uuid, expediente_id uuid, numero text, estado_expediente text, hito_codigo text, origen text,
              evento_fecha timestamptz, fecha date, detalle jsonb, ref_id uuid, correo_id uuid, solicitud_id uuid,
              fecha_programada date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH vacios AS (
    SELECT h.id, h.expediente_id, h.hito_codigo, h.fecha_programada, e.numero, e.estado::text AS estado
    FROM public.expediente_hitos h
    JOIN public.expedientes e ON e.id = h.expediente_id AND e.eliminado_en IS NULL
    WHERE private.has_role(auth.uid(), 'admin'::app_role)
      AND h.fecha_cumplimiento IS NULL AND h.auto_origen IS NULL AND h.estado NOT IN ('completado', 'no_aplica')
      AND h.hito_codigo IN ('documentos_recibidos', 'permiso_vuce_solicitado', 'solicitud_oficio_dga', 'factura_venta_enviada')
  ),
  cand AS (
    SELECT v.*, c.origen, c.ev, c.det, c.ref, c.correo, c.sol
    FROM vacios v CROSS JOIN LATERAL (
      SELECT * FROM (
        SELECT 1 AS prio, 'correo'::text AS origen, o.fecha AS ev, '{}'::jsonb AS det, sc.id AS ref, o.correo_id AS correo, sc.id AS sol
          FROM public.solicitudes_correo sc CROSS JOIN LATERAL public.correo_original_solicitud(sc.id) o
         WHERE sc.expediente_id = v.expediente_id AND o.fecha IS NOT NULL
        UNION ALL
        SELECT 2, 'documentos', d.created_at, jsonb_build_object('tipo', d.tipo), d.id, NULL::uuid, NULL::uuid
          FROM public.documentos d WHERE d.expediente_id = v.expediente_id AND d.storage_path IS NOT NULL
      ) x ORDER BY prio, ev LIMIT 1
    ) c WHERE v.hito_codigo = 'documentos_recibidos'
    UNION ALL
    SELECT v.*, c.origen, c.ev, c.det, c.ref, NULL::uuid, NULL::uuid
    FROM vacios v CROSS JOIN LATERAL (
      SELECT * FROM (
        SELECT 1 AS prio, 'vuce_pdf'::text AS origen, public.fecha_dia_sd(p.fecha_solicitud_vuce) AS ev, jsonb_build_object('permiso', p.numero) AS det, p.id AS ref
          FROM public.permisos p WHERE p.expediente_id = v.expediente_id AND p.eliminado_en IS NULL AND p.fecha_solicitud_vuce IS NOT NULL
        UNION ALL
        SELECT 2, 'vuce_ficha', public.fecha_dia_sd(p.fecha_solicitud), jsonb_build_object('permiso', p.numero), p.id
          FROM public.permisos p WHERE p.expediente_id = v.expediente_id AND p.eliminado_en IS NULL AND p.fecha_solicitud IS NOT NULL
        UNION ALL
        SELECT 3, 'vuce_carga', d.created_at, jsonb_build_object('codigo_siga', d.codigo_siga), d.id
          FROM public.documentos d WHERE d.expediente_id = v.expediente_id AND d.tipo = 'Permiso VUCE previo' AND d.storage_path IS NOT NULL
      ) x ORDER BY prio, ev LIMIT 1
    ) c WHERE v.hito_codigo = 'permiso_vuce_solicitado'
    UNION ALL
    SELECT v.*, 'correo_dga', a.created_at,
           jsonb_build_object('usuario', (SELECT pr.nombre FROM public.profiles pr WHERE pr.id = a.usuario_id)), a.id, NULL::uuid, NULL::uuid
    FROM vacios v CROSS JOIN LATERAL (
      SELECT a.* FROM public.auditoria a
       WHERE a.entidad = 'expedientes' AND a.entidad_id = v.expediente_id AND a.accion = 'correo_dga_preparado'
       ORDER BY a.created_at LIMIT 1
    ) a WHERE v.hito_codigo = 'solicitud_oficio_dga'
    UNION ALL
    SELECT v.*, 'ecf', public.fecha_dia_sd(x.fecha_emision), jsonb_build_object('encf', x.encf), x.id, NULL::uuid, NULL::uuid
    FROM vacios v CROSS JOIN LATERAL (
      SELECT e.id, e.encf, e.fecha_emision FROM public.facturas_ecf e
       WHERE e.eliminado_en IS NULL AND e.fecha_anulacion IS NULL AND COALESCE(e.estado, '') NOT ILIKE 'anulad%'
         AND e.fecha_emision IS NOT NULL AND right(COALESCE(e.tipo_comprobante, ''), 2) IN ('31', '32', '44', '45', '46')
         AND (EXISTS (SELECT 1 FROM public.facturas f WHERE f.factura_ecf_id = e.id AND f.expediente_id = v.expediente_id AND f.deleted_at IS NULL)
           OR EXISTS (SELECT 1 FROM public.facturas_ecf_lineas l WHERE l.factura_id = e.id AND l.expediente_id = v.expediente_id))
       ORDER BY e.fecha_emision, e.created_at LIMIT 1
    ) x WHERE v.hito_codigo = 'factura_venta_enviada'
  )
  SELECT id, expediente_id, numero, estado, hito_codigo, origen, ev, (ev AT TIME ZONE 'America/Santo_Domingo')::date,
         det, ref, correo, sol, fecha_programada
  FROM cand WHERE ev IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.hitos_retroactivos_candidatos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitos_retroactivos_candidatos() TO authenticated;

-- Aplica todos los candidatos como un solo lote; cada fecha queda marcada como retroactiva y ligada al lote.
CREATE OR REPLACE FUNCTION public.aplicar_lote_hitos_retroactivos()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lote uuid; v_n integer; v_prev public.hito_estado; r record;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Solo un administrador puede aplicar el lote.'; END IF;
  INSERT INTO public.hitos_lotes (descripcion, creado_por)
  VALUES ('Completado retroactivo de hitos 1, 2, 4 y 8', auth.uid()) RETURNING id INTO v_lote;
  FOR r IN SELECT * FROM public.hitos_retroactivos_candidatos() LOOP
    SELECT h.estado INTO v_prev FROM public.expediente_hitos h
     WHERE h.id = r.hito_id AND h.fecha_cumplimiento IS NULL AND h.auto_origen IS NULL AND h.estado NOT IN ('completado', 'no_aplica')
     FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    UPDATE public.expediente_hitos
       SET fecha_cumplimiento = r.fecha, estado = 'completado', auto_origen = r.origen, auto_fecha = r.evento_fecha,
           auto_detalle = COALESCE(r.detalle, '{}'::jsonb) || jsonb_build_object('retroactivo', true, 'lote_id', v_lote),
           auto_ref_id = r.ref_id, auto_correo_id = r.correo_id, auto_solicitud_id = r.solicitud_id
     WHERE id = r.hito_id;
    INSERT INTO public.hitos_lote_items (lote_id, hito_id, expediente_id, hito_codigo, origen, fecha, evento_fecha, prev_estado)
    VALUES (v_lote, r.hito_id, r.expediente_id, r.hito_codigo, r.origen, r.fecha, r.evento_fecha, v_prev);
  END LOOP;
  SELECT count(*) INTO v_n FROM public.hitos_lote_items WHERE lote_id = v_lote;
  UPDATE public.hitos_lotes SET total = v_n WHERE id = v_lote;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('hitos_lotes', v_lote, 'lote_hitos_retroactivo', auth.uid(), jsonb_build_object(
    'total', v_n,
    'por_hito', COALESCE((SELECT jsonb_object_agg(hito_codigo, n) FROM (SELECT hito_codigo, count(*) n FROM public.hitos_lote_items WHERE lote_id = v_lote GROUP BY 1) x), '{}'::jsonb)));
  RETURN v_lote;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_lote_hitos_retroactivos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_hitos_retroactivos() TO authenticated;

-- Deshace el lote completo. Solo vacía los hitos que siguen exactamente como los dejó el lote:
-- una fecha cambiada después (a mano o por un evento nuevo) se conserva.
CREATE OR REPLACE FUNCTION public.deshacer_lote_hitos(p_lote uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_rev integer := 0; v_con integer := 0;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Solo un administrador puede deshacer el lote.'; END IF;
  PERFORM 1 FROM public.hitos_lotes WHERE id = p_lote AND deshecho_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El lote no existe o ya se deshizo.'; END IF;
  FOR r IN SELECT * FROM public.hitos_lote_items WHERE lote_id = p_lote LOOP
    UPDATE public.expediente_hitos
       SET fecha_cumplimiento = NULL, estado = r.prev_estado, auto_origen = NULL, auto_fecha = NULL,
           auto_detalle = NULL, auto_ref_id = NULL, auto_correo_id = NULL, auto_solicitud_id = NULL
     WHERE id = r.hito_id AND auto_origen = r.origen AND auto_fecha = r.evento_fecha AND fecha_cumplimiento = r.fecha
       AND auto_detalle->>'lote_id' = p_lote::text;
    IF FOUND THEN
      v_rev := v_rev + 1;
      UPDATE public.hitos_lote_items SET revertido = true WHERE id = r.id;
    ELSE
      v_con := v_con + 1;
    END IF;
  END LOOP;
  UPDATE public.hitos_lotes SET deshecho_en = now(), deshecho_por = auth.uid(), revertidos = v_rev, conservados = v_con WHERE id = p_lote;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('hitos_lotes', p_lote, 'lote_hitos_retroactivo_deshecho', auth.uid(), jsonb_build_object('revertidos', v_rev, 'conservados', v_con));
  RETURN jsonb_build_object('revertidos', v_rev, 'conservados', v_con);
END;
$$;
REVOKE ALL ON FUNCTION public.deshacer_lote_hitos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_hitos(uuid) TO authenticated;