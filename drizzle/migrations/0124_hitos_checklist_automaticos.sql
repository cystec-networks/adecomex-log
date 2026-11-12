-- Origen ampliado de fechas automáticas del Checklist de Despacho.
ALTER TABLE public.expediente_hitos
  ADD COLUMN IF NOT EXISTS auto_detalle jsonb,
  ADD COLUMN IF NOT EXISTS auto_ref_id uuid;
ALTER TABLE public.expediente_hitos DROP CONSTRAINT IF EXISTS expediente_hitos_auto_origen_check;
ALTER TABLE public.expediente_hitos ADD CONSTRAINT expediente_hitos_auto_origen_check
  CHECK (auto_origen IS NULL OR auto_origen IN ('correo', 'documentos', 'manual', 'vuce_pdf', 'vuce_ficha', 'vuce_carga', 'correo_dga', 'gestor', 'ecf'));
COMMENT ON COLUMN public.expediente_hitos.auto_origen IS 'Evento que puso la fecha automáticamente (correo, documentos, vuce_pdf, vuce_ficha, vuce_carga, correo_dga, gestor, ecf); manual = editada a mano (nunca se vuelve a llenar sola); NULL = nunca tocada.';
COMMENT ON COLUMN public.expediente_hitos.auto_detalle IS 'Datos del evento automático para la etiqueta (permiso, usuario, gestor, e-NCF).';
COMMENT ON COLUMN public.expediente_hitos.auto_ref_id IS 'Registro que originó la fecha automática (permiso, documento, auditoría, envío al gestor o e-CF).';

-- Fecha de solicitud leída del PDF VUCE (fila «Registrado/Aceptado» de Autorización Control).
ALTER TABLE public.permisos ADD COLUMN IF NOT EXISTS fecha_solicitud_vuce date;
COMMENT ON COLUMN public.permisos.fecha_solicitud_vuce IS 'Fecha de solicitud que trae el PDF del permiso VUCE (Registrado/Aceptado); distinta de la Fecha de Solicitud escrita a mano.';

-- Un día sin hora se guarda al mediodía de Santo Domingo para que nunca cambie de fecha.
CREATE OR REPLACE FUNCTION public.fecha_dia_sd(p_fecha date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT CASE WHEN p_fecha IS NULL THEN NULL ELSE ((p_fecha + time '12:00') AT TIME ZONE 'America/Santo_Domingo') END $$;

-- Aplica una fecha automática a un hito. Nunca toca una fecha manual (editada a mano o puesta antes del
-- autocompletado) ni un hito «No aplica». p_recalcular permite reemplazar o retirar la fecha que puso el
-- mismo autocompletado cuando cambia su fuente; sin él solo se llena la primera vez.
CREATE OR REPLACE FUNCTION public.aplicar_hito_automatico(
  p_expediente uuid, p_codigo text, p_origen text, p_fecha timestamptz, p_detalle jsonb, p_ref uuid, p_recalcular boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.expediente_hitos%ROWTYPE;
BEGIN
  IF p_expediente IS NULL THEN RETURN false; END IF;
  SELECT * INTO h FROM public.expediente_hitos
   WHERE expediente_id = p_expediente AND hito_codigo = p_codigo
   ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF h.auto_origen = 'manual' OR h.estado = 'no_aplica'
     OR (h.auto_origen IS NULL AND (h.fecha_cumplimiento IS NOT NULL OR h.estado = 'completado')) THEN
    RETURN false;
  END IF;
  IF p_fecha IS NULL THEN
    IF NOT p_recalcular OR h.auto_origen IS NULL THEN RETURN false; END IF;
    UPDATE public.expediente_hitos
       SET fecha_cumplimiento = NULL, estado = 'pendiente', auto_origen = NULL, auto_fecha = NULL,
           auto_detalle = NULL, auto_ref_id = NULL, auto_correo_id = NULL, auto_solicitud_id = NULL
     WHERE id = h.id;
    RETURN true;
  END IF;
  IF h.auto_origen IS NOT NULL AND NOT p_recalcular THEN RETURN false; END IF;
  IF h.auto_origen = p_origen AND h.auto_fecha = p_fecha
     AND h.auto_ref_id IS NOT DISTINCT FROM p_ref AND h.auto_detalle IS NOT DISTINCT FROM p_detalle THEN
    RETURN false;
  END IF;
  UPDATE public.expediente_hitos
     SET fecha_cumplimiento = (p_fecha AT TIME ZONE 'America/Santo_Domingo')::date,
         estado = 'completado', auto_origen = p_origen, auto_fecha = p_fecha,
         auto_detalle = p_detalle, auto_ref_id = p_ref, auto_correo_id = NULL, auto_solicitud_id = NULL
   WHERE id = h.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_hito_automatico(uuid, text, text, timestamptz, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Toda fecha automática (incluido el hito 1) queda en Auditoría.
CREATE OR REPLACE FUNCTION public.hito_automatico_auditar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.auto_origen IS NOT DISTINCT FROM OLD.auto_origen AND NEW.auto_fecha IS NOT DISTINCT FROM OLD.auto_fecha
     AND NEW.auto_detalle IS NOT DISTINCT FROM OLD.auto_detalle THEN
    RETURN NULL;
  END IF;
  IF NEW.auto_origen = 'manual' THEN RETURN NULL; END IF;
  IF NEW.auto_origen IS NULL AND (OLD.auto_origen IS NULL OR OLD.auto_origen = 'manual') THEN RETURN NULL; END IF;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', NEW.expediente_id,
          CASE WHEN NEW.auto_origen IS NULL THEN 'hito_automatico_retirado' ELSE 'hito_automatico' END,
          auth.uid(),
          jsonb_build_object(
            'hito', NEW.hito_codigo,
            'nombre', (SELECT c.nombre FROM public.catalogo_hitos c WHERE c.codigo = NEW.hito_codigo LIMIT 1),
            'fecha', NEW.fecha_cumplimiento, 'anterior', OLD.fecha_cumplimiento,
            'origen', COALESCE(NEW.auto_origen, OLD.auto_origen), 'evento_fecha', NEW.auto_fecha,
            'detalle', NEW.auto_detalle));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_automatico_auditar ON public.expediente_hitos;
CREATE TRIGGER hito_automatico_auditar
  AFTER UPDATE OF auto_origen, auto_fecha, auto_detalle ON public.expediente_hitos
  FOR EACH ROW EXECUTE FUNCTION public.hito_automatico_auditar();

-- Hito 2: fecha del PDF VUCE, luego Fecha de Solicitud de la ficha, luego carga del PDF del permiso.
CREATE OR REPLACE FUNCTION public.recalcular_hito_permiso_vuce(p_expediente uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF p_expediente IS NULL THEN RETURN false; END IF;
  SELECT p.id, p.numero, p.fecha_solicitud_vuce AS f INTO r FROM public.permisos p
   WHERE p.expediente_id = p_expediente AND p.eliminado_en IS NULL AND p.fecha_solicitud_vuce IS NOT NULL
   ORDER BY p.fecha_solicitud_vuce, p.created_at LIMIT 1;
  IF FOUND THEN
    RETURN public.aplicar_hito_automatico(p_expediente, 'permiso_vuce_solicitado', 'vuce_pdf',
      public.fecha_dia_sd(r.f), jsonb_build_object('permiso', r.numero), r.id, true);
  END IF;
  SELECT p.id, p.numero, p.fecha_solicitud AS f INTO r FROM public.permisos p
   WHERE p.expediente_id = p_expediente AND p.eliminado_en IS NULL AND p.fecha_solicitud IS NOT NULL
   ORDER BY p.fecha_solicitud, p.created_at LIMIT 1;
  IF FOUND THEN
    RETURN public.aplicar_hito_automatico(p_expediente, 'permiso_vuce_solicitado', 'vuce_ficha',
      public.fecha_dia_sd(r.f), jsonb_build_object('permiso', r.numero), r.id, true);
  END IF;
  SELECT d.id, d.codigo_siga, d.created_at AS f INTO r FROM public.documentos d
   WHERE d.expediente_id = p_expediente AND d.tipo = 'Permiso VUCE previo' AND d.storage_path IS NOT NULL
   ORDER BY d.created_at LIMIT 1;
  IF FOUND THEN
    RETURN public.aplicar_hito_automatico(p_expediente, 'permiso_vuce_solicitado', 'vuce_carga',
      r.f, jsonb_build_object('codigo_siga', r.codigo_siga), r.id, true);
  END IF;
  RETURN public.aplicar_hito_automatico(p_expediente, 'permiso_vuce_solicitado', 'vuce_carga', NULL, NULL, NULL, true);
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_hito_permiso_vuce(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hito_vuce_por_permiso()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalcular_hito_permiso_vuce(NEW.expediente_id); END IF;
  IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR OLD.expediente_id IS DISTINCT FROM NEW.expediente_id) THEN
    PERFORM public.recalcular_hito_permiso_vuce(OLD.expediente_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_vuce_por_permiso ON public.permisos;
CREATE TRIGGER hito_vuce_por_permiso
  AFTER INSERT OR DELETE OR UPDATE OF fecha_solicitud, fecha_solicitud_vuce, expediente_id, eliminado_en ON public.permisos
  FOR EACH ROW EXECUTE FUNCTION public.hito_vuce_por_permiso();

CREATE OR REPLACE FUNCTION public.hito_vuce_por_documento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.tipo = 'Permiso VUCE previo' THEN
    PERFORM public.recalcular_hito_permiso_vuce(NEW.expediente_id);
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.tipo = 'Permiso VUCE previo'
     AND (TG_OP = 'DELETE' OR OLD.expediente_id IS DISTINCT FROM NEW.expediente_id OR NEW.tipo IS DISTINCT FROM OLD.tipo) THEN
    PERFORM public.recalcular_hito_permiso_vuce(OLD.expediente_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_vuce_por_documento ON public.documentos;
CREATE TRIGGER hito_vuce_por_documento
  AFTER INSERT OR DELETE OR UPDATE OF storage_path, tipo, expediente_id ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.hito_vuce_por_documento();

-- Hito 4: primera vez que se prepara el «Correo a DGA» (no confirma el envío).
CREATE OR REPLACE FUNCTION public.hito_oficio_por_correo_dga()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.aplicar_hito_automatico(NEW.entidad_id, 'solicitud_oficio_dga', 'correo_dga', NEW.created_at,
    jsonb_build_object('usuario', (SELECT pr.nombre FROM public.profiles pr WHERE pr.id = NEW.usuario_id)), NEW.id, false);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_oficio_por_correo_dga ON public.auditoria;
CREATE TRIGGER hito_oficio_por_correo_dga
  AFTER INSERT ON public.auditoria
  FOR EACH ROW WHEN (NEW.accion = 'correo_dga_preparado' AND NEW.entidad = 'expedientes')
  EXECUTE FUNCTION public.hito_oficio_por_correo_dga();

-- Hito 8: emisión de la primera e-CF de venta vinculada al Expediente.
CREATE OR REPLACE FUNCTION public.recalcular_hito_factura_venta(p_expediente uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF p_expediente IS NULL THEN RETURN false; END IF;
  SELECT e.id, e.encf, e.fecha_emision INTO r FROM public.facturas_ecf e
   WHERE e.eliminado_en IS NULL AND e.fecha_anulacion IS NULL AND COALESCE(e.estado, '') NOT ILIKE 'anulad%'
     AND e.fecha_emision IS NOT NULL AND right(COALESCE(e.tipo_comprobante, ''), 2) IN ('31', '32', '44', '45', '46')
     AND (EXISTS (SELECT 1 FROM public.facturas f WHERE f.factura_ecf_id = e.id AND f.expediente_id = p_expediente AND f.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.facturas_ecf_lineas l WHERE l.factura_id = e.id AND l.expediente_id = p_expediente))
   ORDER BY e.fecha_emision, e.created_at LIMIT 1;
  IF FOUND THEN
    RETURN public.aplicar_hito_automatico(p_expediente, 'factura_venta_enviada', 'ecf',
      public.fecha_dia_sd(r.fecha_emision), jsonb_build_object('encf', r.encf), r.id, true);
  END IF;
  RETURN public.aplicar_hito_automatico(p_expediente, 'factura_venta_enviada', 'ecf', NULL, NULL, NULL, true);
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_hito_factura_venta(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hito_factura_por_vinculo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalcular_hito_factura_venta(NEW.expediente_id); END IF;
  IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR OLD.expediente_id IS DISTINCT FROM NEW.expediente_id) THEN
    PERFORM public.recalcular_hito_factura_venta(OLD.expediente_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_factura_por_vinculo ON public.facturas;
CREATE TRIGGER hito_factura_por_vinculo
  AFTER INSERT OR DELETE OR UPDATE OF factura_ecf_id, expediente_id, deleted_at ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.hito_factura_por_vinculo();
DROP TRIGGER IF EXISTS hito_factura_por_linea ON public.facturas_ecf_lineas;
CREATE TRIGGER hito_factura_por_linea
  AFTER INSERT OR DELETE OR UPDATE OF expediente_id ON public.facturas_ecf_lineas
  FOR EACH ROW EXECUTE FUNCTION public.hito_factura_por_vinculo();

CREATE OR REPLACE FUNCTION public.hito_factura_por_ecf()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_exp uuid;
BEGIN
  FOR v_exp IN
    SELECT f.expediente_id FROM public.facturas f WHERE f.factura_ecf_id = NEW.id AND f.expediente_id IS NOT NULL
    UNION SELECT l.expediente_id FROM public.facturas_ecf_lineas l WHERE l.factura_id = NEW.id AND l.expediente_id IS NOT NULL
  LOOP
    PERFORM public.recalcular_hito_factura_venta(v_exp);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hito_factura_por_ecf ON public.facturas_ecf;
CREATE TRIGGER hito_factura_por_ecf
  AFTER UPDATE OF fecha_emision, estado, eliminado_en, tipo_comprobante, fecha_anulacion ON public.facturas_ecf
  FOR EACH ROW EXECUTE FUNCTION public.hito_factura_por_ecf();

-- Hito 7: registro del envío al gestor (sin correo), con historial.
CREATE TABLE IF NOT EXISTS public.expediente_envios_gestor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  gestor_id uuid REFERENCES public.catalogo_gestores_honorarios(id) ON DELETE SET NULL,
  gestor_nombre text NOT NULL DEFAULT '',
  enviado_en timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid DEFAULT auth.uid(),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expediente_envios_gestor_exp_idx ON public.expediente_envios_gestor (expediente_id, enviado_en DESC);
GRANT SELECT, INSERT ON public.expediente_envios_gestor TO authenticated;
GRANT ALL ON public.expediente_envios_gestor TO service_role;
ALTER TABLE public.expediente_envios_gestor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff lee envios gestor" ON public.expediente_envios_gestor;
CREATE POLICY "Staff lee envios gestor" ON public.expediente_envios_gestor
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff registra envio gestor" ON public.expediente_envios_gestor;
CREATE POLICY "Staff registra envio gestor" ON public.expediente_envios_gestor
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'ejecutivo'::app_role, 'agente_aduanal'::app_role])
              AND enviado_por = auth.uid());

-- El gestor sale siempre del catálogo y la fecha/usuario los pone el servidor.
CREATE OR REPLACE FUNCTION public.envio_gestor_preparar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_nombre text;
BEGIN
  SELECT g.nombre INTO v_nombre FROM public.catalogo_gestores_honorarios g WHERE g.id = NEW.gestor_id AND g.estado = 'activo';
  IF v_nombre IS NULL THEN RAISE EXCEPTION 'Elige un gestor activo del catálogo.'; END IF;
  NEW.gestor_nombre := v_nombre;
  NEW.enviado_en := now();
  NEW.enviado_por := auth.uid();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS envio_gestor_preparar ON public.expediente_envios_gestor;
CREATE TRIGGER envio_gestor_preparar BEFORE INSERT ON public.expediente_envios_gestor
  FOR EACH ROW EXECUTE FUNCTION public.envio_gestor_preparar();

CREATE OR REPLACE FUNCTION public.envio_gestor_registrar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_usuario text;
BEGIN
  SELECT pr.nombre INTO v_usuario FROM public.profiles pr WHERE pr.id = NEW.enviado_por;
  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', NEW.expediente_id, 'enviado_gestor', NEW.enviado_por,
          jsonb_build_object('gestor', NEW.gestor_nombre, 'enviado_en', NEW.enviado_en, 'notas', NEW.notas, 'envio_id', NEW.id));
  PERFORM public.aplicar_hito_automatico(NEW.expediente_id, 'expediente_enviado_gestor', 'gestor', NEW.enviado_en,
    jsonb_build_object('gestor', NEW.gestor_nombre, 'usuario', v_usuario), NEW.id, false);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS envio_gestor_registrar ON public.expediente_envios_gestor;
CREATE TRIGGER envio_gestor_registrar AFTER INSERT ON public.expediente_envios_gestor
  FOR EACH ROW EXECUTE FUNCTION public.envio_gestor_registrar();