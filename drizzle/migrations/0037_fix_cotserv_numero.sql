CREATE OR REPLACE FUNCTION public.cotizaciones_servicios_set_numero()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE n bigint; cand text;
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    LOOP
      n := nextval('public.cotizaciones_servicios_seq');
      cand := 'COTSERV-' || CASE WHEN length(n::text) >= 6 THEN n::text ELSE lpad(n::text, 6, '0') END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cotizaciones_servicios WHERE numero = cand);
    END LOOP;
    NEW.numero := cand;
  END IF;
  RETURN NEW;
END; $function$;

SELECT setval('public.cotizaciones_servicios_seq', GREATEST(8, COALESCE((SELECT max((substring(numero from '^COTSERV-0*([0-9]{1,6})$'))::bigint) FROM public.cotizaciones_servicios), 0)), true);