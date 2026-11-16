-- Hito 3 «Preferencia arancelaria presentada en SIGA»: se completa con el Certificado de Origen DGA.
ALTER TABLE public.expediente_hitos DROP CONSTRAINT IF EXISTS expediente_hitos_auto_origen_check;
ALTER TABLE public.expediente_hitos ADD CONSTRAINT expediente_hitos_auto_origen_check
  CHECK (auto_origen IS NULL OR auto_origen IN ('correo', 'documentos', 'manual', 'vuce_pdf', 'vuce_ficha', 'vuce_carga', 'correo_dga', 'gestor', 'ecf', 'certificado_dga'));
COMMENT ON COLUMN public.expediente_hitos.auto_origen IS 'Evento que puso la fecha automáticamente (correo, documentos, vuce_pdf, vuce_ficha, vuce_carga, correo_dga, gestor, ecf, certificado_dga); manual = editada a mano (nunca se vuelve a llenar sola); NULL = nunca tocada.';

-- Solo el tipo «Certificado de Origen DGA» (nunca el código SIGA CEO-nnn, que es correlativo por expediente).
-- Se dispara la primera vez que el documento tiene archivo o queda Recibido/Aprobado; reemplazos posteriores
-- no cambian la fecha. Nunca toca una fecha manual ni la Fecha programada (aplicar_hito_automatico).
CREATE OR REPLACE FUNCTION public.hito_preferencia_por_certificado_dga()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo constant text := 'Certificado de Origen DGA';
  v_nuevo boolean := false;
  v_antes boolean := false;
  v_uid uuid := auth.uid();
  v_quien text;
  v_h public.expediente_hitos%ROWTYPE;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_nuevo := NEW.tipo = v_tipo AND (NEW.storage_path IS NOT NULL OR NEW.estado IN ('recibido', 'aprobado'));
    IF TG_OP = 'UPDATE' THEN
      v_antes := OLD.tipo = v_tipo AND (OLD.storage_path IS NOT NULL OR OLD.estado IN ('recibido', 'aprobado'))
                 AND OLD.expediente_id IS NOT DISTINCT FROM NEW.expediente_id;
    END IF;
    IF v_nuevo AND NOT v_antes THEN
      v_quien := CASE
        WHEN v_uid IS NOT NULL THEN COALESCE((SELECT pr.nombre FROM public.profiles pr WHERE pr.id = v_uid), 'Usuario')
        WHEN NEW.origen_cambio = 'correo' OR COALESCE(NEW.observaciones, '') ILIKE 'Adjunto de correo%' THEN 'Correo automático'
        ELSE 'Proceso automático' END;
      PERFORM public.aplicar_hito_automatico(NEW.expediente_id, 'preferencia_arancelaria_siga', 'certificado_dga',
        CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE now() END,
        jsonb_build_object('documento', NEW.tipo, 'codigo_siga', NEW.codigo_siga, 'documento_id', NEW.id,
                           'evento', CASE WHEN NEW.storage_path IS NOT NULL THEN 'subido' ELSE 'marcado_recibido' END,
                           'usuario', v_quien),
        NEW.id, false);
    END IF;
  END IF;

  -- Documento eliminado o sacado del tipo/expediente: la fecha del hito se conserva, con nota en Auditoría.
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.tipo = v_tipo
      AND (NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.expediente_id IS DISTINCT FROM OLD.expediente_id)) THEN
    SELECT * INTO v_h FROM public.expediente_hitos
     WHERE expediente_id = OLD.expediente_id AND hito_codigo = 'preferencia_arancelaria_siga' AND fecha_cumplimiento IS NOT NULL
     ORDER BY created_at LIMIT 1;
    IF FOUND AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = OLD.expediente_id) THEN
      INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
      VALUES ('expedientes', OLD.expediente_id, 'hito_documento_origen_eliminado', v_uid, jsonb_build_object(
        'hito', v_h.hito_codigo,
        'nombre', (SELECT c.nombre FROM public.catalogo_hitos c WHERE c.codigo = v_h.hito_codigo LIMIT 1),
        'fecha', v_h.fecha_cumplimiento,
        'tipo', OLD.tipo, 'codigo_siga', OLD.codigo_siga, 'documento_id', OLD.id,
        'motivo', CASE WHEN TG_OP = 'DELETE' THEN 'eliminado' ELSE 'reclasificado' END,
        'origen_hito', CASE WHEN v_h.auto_origen = 'certificado_dga' AND v_h.auto_ref_id = OLD.id THEN 'este_documento'
                            WHEN v_h.auto_origen IN ('manual') OR v_h.auto_origen IS NULL THEN 'manual' ELSE 'otro' END));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hito_preferencia_por_certificado_dga() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hito_preferencia_por_certificado_dga ON public.documentos;
CREATE TRIGGER hito_preferencia_por_certificado_dga
  AFTER INSERT OR DELETE OR UPDATE OF storage_path, estado, tipo, expediente_id ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.hito_preferencia_por_certificado_dga();

-- Vista previa retroactiva: incluye el hito 3 con la carga del primer Certificado de Origen DGA.
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
      AND h.hito_codigo IN ('documentos_recibidos', 'permiso_vuce_solicitado', 'preferencia_arancelaria_siga', 'solicitud_oficio_dga', 'factura_venta_enviada')
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
    UNION ALL
    SELECT v.*, 'certificado_dga', x.created_at,
           jsonb_build_object('documento', x.tipo, 'codigo_siga', x.codigo_siga, 'documento_id', x.id,
                              'evento', CASE WHEN x.storage_path IS NOT NULL THEN 'subido' ELSE 'marcado_recibido' END,
                              'usuario', (SELECT pr.nombre FROM public.profiles pr WHERE pr.id = x.creado_por)), x.id, NULL::uuid, NULL::uuid
    FROM vacios v CROSS JOIN LATERAL (
      SELECT d.id, d.tipo, d.codigo_siga, d.created_at, d.storage_path, d.creado_por FROM public.documentos d
       WHERE d.expediente_id = v.expediente_id AND d.tipo = 'Certificado de Origen DGA'
         AND (d.storage_path IS NOT NULL OR d.estado IN ('recibido', 'aprobado'))
       ORDER BY d.created_at LIMIT 1
    ) x WHERE v.hito_codigo = 'preferencia_arancelaria_siga'
  )
  SELECT id, expediente_id, numero, estado, hito_codigo, origen, ev, (ev AT TIME ZONE 'America/Santo_Domingo')::date,
         det, ref, correo, sol, fecha_programada
  FROM cand WHERE ev IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.hitos_retroactivos_candidatos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hitos_retroactivos_candidatos() TO authenticated;

-- Aplicar el lote solo para los hitos indicados (p_codigos NULL = todos los candidatos).
DROP FUNCTION IF EXISTS public.aplicar_lote_hitos_retroactivos(uuid[]);
CREATE OR REPLACE FUNCTION public.aplicar_lote_hitos_retroactivos(p_excluir uuid[] DEFAULT '{}'::uuid[], p_codigos text[] DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lote uuid; v_n integer; v_prev public.hito_estado; r record; v_excl jsonb; v_desc text;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Solo un administrador puede aplicar el lote.'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('hito_id', c.hito_id, 'numero', c.numero, 'hito', c.hito_codigo, 'fecha', c.fecha) ORDER BY c.numero), '[]'::jsonb)
    INTO v_excl FROM public.hitos_retroactivos_candidatos() c
   WHERE c.hito_id = ANY(COALESCE(p_excluir, '{}'::uuid[])) AND (p_codigos IS NULL OR c.hito_codigo = ANY(p_codigos));
  v_desc := CASE WHEN p_codigos IS NULL THEN 'Completado retroactivo de hitos automáticos'
                 ELSE 'Completado retroactivo de ' || array_to_string(p_codigos, ', ') END;
  INSERT INTO public.hitos_lotes (descripcion, creado_por)
  VALUES (v_desc || CASE WHEN jsonb_array_length(v_excl) > 0 THEN ' (' || jsonb_array_length(v_excl) || ' excluidos para completar a mano)' ELSE '' END,
          auth.uid()) RETURNING id INTO v_lote;
  FOR r IN SELECT * FROM public.hitos_retroactivos_candidatos() c
            WHERE NOT (c.hito_id = ANY(COALESCE(p_excluir, '{}'::uuid[]))) AND (p_codigos IS NULL OR c.hito_codigo = ANY(p_codigos)) LOOP
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
    'por_hito', COALESCE((SELECT jsonb_object_agg(hito_codigo, n) FROM (SELECT hito_codigo, count(*) n FROM public.hitos_lote_items WHERE lote_id = v_lote GROUP BY 1) x), '{}'::jsonb),
    'excluidos', v_excl, 'codigos', to_jsonb(p_codigos)));
  RETURN v_lote;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_lote_hitos_retroactivos(uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_hitos_retroactivos(uuid[], text[]) TO authenticated;