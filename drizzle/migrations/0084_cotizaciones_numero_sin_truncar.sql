CREATE OR REPLACE FUNCTION public.cotizaciones_set_numero() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
DECLARE n bigint; candidate text;
BEGIN
 IF NEW.numero IS NULL OR btrim(NEW.numero)='' THEN
  LOOP
   n:=nextval('public.cotizaciones_seq');
   candidate:='COT-'||CASE WHEN length(n::text)>=6 THEN n::text ELSE lpad(n::text,6,'0') END;
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE numero=candidate);
  END LOOP;
  NEW.numero:=candidate;
 END IF;
 RETURN NEW;
END;$function$;