CREATE OR REPLACE FUNCTION public.avanzar_orden_por_expediente()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.solicitud_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'presentar' AND OLD.estado = 'digitar' THEN
    UPDATE public.ordenes
       SET estado = 'declarada'
     WHERE solicitud_id = NEW.solicitud_id
       AND estado = 'en_transito';
  END IF;

  IF NEW.estado = 'despachado' AND OLD.estado IS DISTINCT FROM 'despachado' THEN
    UPDATE public.ordenes
       SET estado = 'despachada'
     WHERE solicitud_id = NEW.solicitud_id
       AND estado = 'impuestos_pagados';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_avanzar_orden_por_expediente
AFTER UPDATE OF estado ON public.expedientes
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.avanzar_orden_por_expediente();

CREATE OR REPLACE FUNCTION public.avanzar_orden_por_etapa()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_solicitud_id uuid;
BEGIN
  IF NEW.estado <> 'completada' OR OLD.estado = 'completada' THEN
    RETURN NEW;
  END IF;

  SELECT solicitud_id INTO v_solicitud_id
  FROM public.expedientes WHERE id = NEW.expediente_id;

  IF v_solicitud_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.nombre = 'Pago de impuestos y tasas' THEN
    UPDATE public.ordenes
       SET estado = 'impuestos_pagados'
     WHERE solicitud_id = v_solicitud_id
       AND estado = 'declarada';
  ELSIF NEW.nombre = 'Entrega al cliente' THEN
    UPDATE public.ordenes
       SET estado = 'entregada'
     WHERE solicitud_id = v_solicitud_id
       AND estado = 'despachada';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_avanzar_orden_por_etapa
AFTER UPDATE OF estado ON public.etapas
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.avanzar_orden_por_etapa();