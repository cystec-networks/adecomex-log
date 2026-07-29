GRANT SELECT, UPDATE ON public.solicitudes_pago_transporte TO authenticated;
GRANT ALL ON public.solicitudes_pago_transporte TO service_role;
GRANT USAGE ON SEQUENCE public.solicitudes_pago_transporte_seq TO service_role;

CREATE OR REPLACE FUNCTION public.spt_set_numero_control()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_control IS NULL OR btrim(NEW.numero_control) = '' THEN
    NEW.numero_control := 'SPT-' || lpad(nextval('public.solicitudes_pago_transporte_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spt_numero_control ON public.solicitudes_pago_transporte;
CREATE TRIGGER trg_spt_numero_control
BEFORE INSERT ON public.solicitudes_pago_transporte
FOR EACH ROW EXECUTE FUNCTION public.spt_set_numero_control();

ALTER TABLE public.solicitudes_pago_transporte ALTER COLUMN numero_control DROP NOT NULL;