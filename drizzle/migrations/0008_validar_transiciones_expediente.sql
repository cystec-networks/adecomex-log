ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS forzar_regreso_estado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_regreso_estado text;

CREATE OR REPLACE FUNCTION public.validar_transicion_expediente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  orden text[] := ARRAY['digitar','en_transito','manifestado','presentar','verificar','despachado','entregado','facturar'];
  i_old int;
  i_new int;
  i int;
  paso text;
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
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operaciones')) THEN
      RAISE EXCEPTION 'Solo los roles Administrador u Operaciones pueden forzar el regreso de estado.';
    END IF;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', NEW.id,
            'regreso_forzado_estado:' || OLD.estado::text || '->' || NEW.estado::text,
            auth.uid(),
            jsonb_build_object('estado_anterior', OLD.estado::text, 'estado_nuevo', NEW.estado::text, 'motivo', NEW.motivo_regreso_estado));
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;

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
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.liq_siga_numero), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Despachado: falta el N.º Liquidación SIGA (Resultado oficial DGA).';
    ELSIF paso = 'entregado' AND NOT EXISTS (SELECT 1 FROM public.gastos_operativos g WHERE g.expediente_id = NEW.id) THEN
      RAISE EXCEPTION 'No se puede pasar a Entregado: no hay gastos operativos registrados en el expediente.';
    ELSIF paso = 'facturar' AND NOT EXISTS (SELECT 1 FROM public.facturas_ecf f WHERE f.expediente_id = NEW.id) THEN
      RAISE EXCEPTION 'No se puede pasar a Facturado: no hay una factura e-CF vinculada al expediente.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS z_validar_transicion_expediente ON public.expedientes;
CREATE TRIGGER z_validar_transicion_expediente
BEFORE UPDATE OF estado ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.validar_transicion_expediente();

CREATE OR REPLACE FUNCTION public.expedientes_auto_en_transito()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.fecha_compromiso IS NULL
     AND NEW.fecha_compromiso IS NOT NULL
     AND NEW.estado = 'digitar'
     AND COALESCE(btrim(NEW.bl_awb), '') <> '' THEN
    NEW.estado := 'en_transito';
  END IF;
  RETURN NEW;
END;
$function$;