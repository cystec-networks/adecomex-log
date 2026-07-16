ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS fecha_en_transito date,
  ADD COLUMN IF NOT EXISTS fecha_entregado date;

CREATE OR REPLACE FUNCTION public.expedientes_set_fecha_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'digitar' AND NEW.fecha_recibido IS NULL THEN
      NEW.fecha_recibido := CURRENT_DATE;
    ELSIF NEW.estado = 'en_transito' AND NEW.fecha_en_transito IS NULL THEN
      NEW.fecha_en_transito := CURRENT_DATE;
    ELSIF NEW.estado = 'presentar' AND NEW.fecha_presentado IS NULL THEN
      NEW.fecha_presentado := CURRENT_DATE;
    ELSIF NEW.estado = 'verificar' AND NEW.fecha_verificado IS NULL THEN
      NEW.fecha_verificado := CURRENT_DATE;
    ELSIF NEW.estado = 'despachado' AND NEW.fecha_despachado IS NULL THEN
      NEW.fecha_despachado := CURRENT_DATE;
    ELSIF NEW.estado = 'entregado' AND NEW.fecha_entregado IS NULL THEN
      NEW.fecha_entregado := CURRENT_DATE;
    ELSIF NEW.estado = 'facturar' AND NEW.fecha_facturado IS NULL THEN
      NEW.fecha_facturado := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expedientes_auto_en_transito()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.fecha_compromiso IS NULL
     AND NEW.fecha_compromiso IS NOT NULL
     AND NEW.estado = 'digitar' THEN
    NEW.estado := 'en_transito';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_expedientes_auto_en_transito ON public.expedientes;
CREATE TRIGGER trg_expedientes_auto_en_transito
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.expedientes_auto_en_transito();