CREATE OR REPLACE FUNCTION public.validar_transicion_expediente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  orden text[] := ARRAY['digitar','en_transito','manifestado','presentar','verificar','despachado','entregado','facturar'];
  i_old int; i_new int; i int; paso text; forzar boolean; n_perm int; ej text;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;
  i_old := array_position(orden, OLD.estado::text);
  i_new := array_position(orden, NEW.estado::text);
  IF i_old IS NULL OR i_new IS NULL THEN
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;
  IF i_new < i_old THEN
    IF NOT COALESCE(NEW.forzar_regreso_estado, false) THEN
      RAISE EXCEPTION 'No se puede regresar el expediente a un estado anterior. Solo Administración u Operaciones pueden corregir el estado.';
    END IF;
    IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'operaciones'::public.app_role)) THEN
      RAISE EXCEPTION 'Solo los roles Administrador u Operaciones pueden forzar el regreso de estado.';
    END IF;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', NEW.id, 'regreso_forzado_estado:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
            jsonb_build_object('estado_anterior', OLD.estado::text, 'estado_nuevo', NEW.estado::text, 'motivo', NEW.motivo_regreso_estado));
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;
  forzar := COALESCE(NEW.forzar_regreso_estado, false);
  NEW.forzar_regreso_estado := false;
  FOR i IN (i_old + 1)..i_new LOOP
    paso := orden[i];
    IF paso = 'en_transito' AND COALESCE(btrim(NEW.bl_awb), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a En Tránsito: falta el BL / AWB / Guía (Información General).';
    ELSIF paso = 'manifestado' AND NEW.fecha_llegada_real IS NULL THEN
      RAISE EXCEPTION 'No se puede pasar a Manifestado: falta la Fecha de Llegada Real (Información General).';
    ELSIF paso = 'presentar' AND COALESCE(btrim(NEW.numero_dua), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Presentado: falta la Declaración DUA (sección Declaración).';
    ELSIF paso = 'verificar' AND COALESCE(btrim(NEW.numero_igra), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Verificado: falta el Número de despacho (sección Declaración).';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.numero_igra), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta capturar el Número de despacho.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.numero_dua), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta capturar la Declaración DUA.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.regimen_aduanero), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta seleccionar el Régimen Aduanero.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.liq_siga_numero), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Despachado: falta el N.º Liquidación SIGA (Resultado oficial DGA).';
    ELSIF paso = 'despachado' AND NOT EXISTS (SELECT 1 FROM public.gastos g WHERE g.expediente_id = NEW.id AND g.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'No se puede pasar a Despachado: no hay gastos operativos registrados en el expediente.';
    ELSIF paso = 'entregado' AND NOT EXISTS (SELECT 1 FROM public.gastos g WHERE g.expediente_id = NEW.id AND g.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'No se puede pasar a Entregado: no hay gastos operativos registrados en el expediente.';
    ELSIF paso = 'facturar' AND NEW.factura_ecf_id IS NULL THEN
      RAISE EXCEPTION 'No se puede pasar a Facturado: no hay una factura e-CF vinculada al expediente.';
    END IF;
    IF paso = 'despachado' THEN
      SELECT count(*), min(COALESCE(p.numero, p.tipo::text) || ' (' || p.tipo::text || ') - Estado: ' || p.estado::text)
        INTO n_perm, ej
        FROM public.permisos p
       WHERE p.expediente_id = NEW.id AND p.eliminado_en IS NULL AND p.estado <> 'aprobado';
      IF n_perm > 0 THEN
        IF forzar AND (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'operaciones'::public.app_role)) THEN
          INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
          VALUES ('expedientes', NEW.id, 'despacho_forzado_permisos:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
                  jsonb_build_object('permisos_sin_aprobar', n_perm, 'ejemplo', ej, 'motivo', NEW.motivo_regreso_estado));
        ELSE
          RAISE EXCEPTION 'No se puede despachar este Expediente: tiene % permiso(s) sin aprobar (ej. %). Todos los permisos asociados deben estar Aprobados antes de despachar.', n_perm, ej;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;