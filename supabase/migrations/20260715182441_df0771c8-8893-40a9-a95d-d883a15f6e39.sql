
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS fecha_recibido date,
  ADD COLUMN IF NOT EXISTS fecha_presentado date,
  ADD COLUMN IF NOT EXISTS fecha_verificado date,
  ADD COLUMN IF NOT EXISTS fecha_facturado date,
  ADD COLUMN IF NOT EXISTS fecha_despachado date;

CREATE OR REPLACE FUNCTION public.expedientes_set_fecha_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'digitar' AND NEW.fecha_recibido IS NULL THEN
      NEW.fecha_recibido := CURRENT_DATE;
    ELSIF NEW.estado = 'presentar' AND NEW.fecha_presentado IS NULL THEN
      NEW.fecha_presentado := CURRENT_DATE;
    ELSIF NEW.estado = 'verificar' AND NEW.fecha_verificado IS NULL THEN
      NEW.fecha_verificado := CURRENT_DATE;
    ELSIF NEW.estado = 'facturar' AND NEW.fecha_facturado IS NULL THEN
      NEW.fecha_facturado := CURRENT_DATE;
    ELSIF NEW.estado = 'despachado' AND NEW.fecha_despachado IS NULL THEN
      NEW.fecha_despachado := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expedientes_set_fecha_estado ON public.expedientes;
CREATE TRIGGER trg_expedientes_set_fecha_estado
BEFORE UPDATE OF estado ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.expedientes_set_fecha_estado();

CREATE OR REPLACE FUNCTION public.expedientes_set_fecha_recibido_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.fecha_recibido IS NULL THEN
    NEW.fecha_recibido := COALESCE(NEW.created_at::date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expedientes_set_fecha_recibido_insert ON public.expedientes;
CREATE TRIGGER trg_expedientes_set_fecha_recibido_insert
BEFORE INSERT ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.expedientes_set_fecha_recibido_insert();
