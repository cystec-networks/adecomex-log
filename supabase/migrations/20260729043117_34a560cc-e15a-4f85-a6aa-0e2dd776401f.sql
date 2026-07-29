ALTER TABLE public.solicitudes_pago_transporte
  ALTER COLUMN numero_control SET DEFAULT ('TR-' || lpad(nextval('public.transportes_seq')::text, 6, '0'));

CREATE OR REPLACE FUNCTION public.spt_set_numero_control()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.numero_control IS NULL OR btrim(NEW.numero_control) = '' THEN
    NEW.numero_control := 'TR-' || lpad(nextval('public.transportes_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;