ALTER TABLE public.confirmaciones_correo DROP CONSTRAINT IF EXISTS confirmaciones_correo_estado_check;
ALTER TABLE public.confirmaciones_correo ADD CONSTRAINT confirmaciones_correo_estado_check CHECK (estado IN ('borrador','pendiente','enviada','descartada'));
CREATE UNIQUE INDEX IF NOT EXISTS confirmaciones_correo_borrador_unico ON public.confirmaciones_correo(expediente_id) WHERE estado='borrador';

CREATE OR REPLACE FUNCTION public.confirmacion_correo_reutilizar_pendiente()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $f$
BEGIN
  IF NEW.estado IN ('borrador','pendiente') AND NEW.expediente_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('confirmacion:'||NEW.expediente_id::text,0));
    UPDATE public.confirmaciones_correo SET para=NEW.para, cc=NEW.cc, asunto=NEW.asunto, cuerpo=NEW.cuerpo,
      id_hilo=coalesce(NEW.id_hilo,id_hilo), solicitud_correo_id=coalesce(NEW.solicitud_correo_id,solicitud_correo_id), created_at=now()
    WHERE expediente_id=NEW.expediente_id AND estado=NEW.estado;
    IF FOUND THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END; $f$;

DROP POLICY IF EXISTS confirmaciones_correo_insert ON public.confirmaciones_correo;
DROP POLICY IF EXISTS confirmaciones_correo_update ON public.confirmaciones_correo;
CREATE POLICY confirmaciones_correo_insert ON public.confirmaciones_correo
  FOR INSERT TO authenticated WITH CHECK (
    private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado = 'borrador' AND enviado_en IS NULL AND expediente_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.solicitudes_correo s
      WHERE s.id = solicitud_correo_id AND s.expediente_id = confirmaciones_correo.expediente_id
        AND s.id_hilo IS NOT DISTINCT FROM confirmaciones_correo.id_hilo));
CREATE POLICY confirmaciones_correo_update ON public.confirmaciones_correo
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado IN ('borrador','pendiente') AND enviado_en IS NULL)
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado IN ('borrador','pendiente','descartada') AND enviado_en IS NULL
    AND EXISTS (SELECT 1 FROM public.solicitudes_correo s
      WHERE s.id = solicitud_correo_id AND s.expediente_id = confirmaciones_correo.expediente_id
        AND s.id_hilo IS NOT DISTINCT FROM confirmaciones_correo.id_hilo));

-- Approve a reviewed draft: only here does a confirmation enter the outbound queue.
CREATE OR REPLACE FUNCTION public.aprobar_confirmacion_correo(p_id uuid, p_para text, p_cc text, p_asunto text, p_cuerpo text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $f$
DECLARE v_b public.confirmaciones_correo%ROWTYPE; v_id uuid;
BEGIN
  IF coalesce(btrim(p_para),'')='' OR coalesce(btrim(p_asunto),'')='' OR coalesce(btrim(p_cuerpo),'')='' THEN
    RAISE EXCEPTION 'Destinatario, asunto y cuerpo son obligatorios' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_b FROM public.confirmaciones_correo WHERE id=p_id AND estado='borrador' FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'El borrador ya no está disponible' USING ERRCODE='P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('confirmacion:'||v_b.expediente_id::text,0));
  UPDATE public.confirmaciones_correo SET para=p_para, cc=nullif(btrim(p_cc),''), asunto=p_asunto, cuerpo=p_cuerpo, created_at=now()
    WHERE expediente_id=v_b.expediente_id AND estado='pendiente' RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    UPDATE public.confirmaciones_correo SET estado='descartada' WHERE id=p_id;
    RETURN v_id;
  END IF;
  UPDATE public.confirmaciones_correo SET para=p_para, cc=nullif(btrim(p_cc),''), asunto=p_asunto, cuerpo=p_cuerpo, estado='pendiente', created_at=now()
    WHERE id=p_id;
  RETURN p_id;
END; $f$;
REVOKE ALL ON FUNCTION public.aprobar_confirmacion_correo(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_confirmacion_correo(uuid,text,text,text,text) TO authenticated;