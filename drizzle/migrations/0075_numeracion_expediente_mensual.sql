CREATE OR REPLACE FUNCTION public.asignar_numero_expediente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pref text; sig int;
BEGIN
  IF NEW.numero IS NOT NULL AND btrim(NEW.numero) <> '' AND NEW.numero NOT LIKE 'EXP-%' THEN RETURN NEW; END IF;
  pref := to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'YYYYMM');
  PERFORM pg_advisory_xact_lock(hashtext('numero_expediente_' || pref));
  SELECT COALESCE(MAX(substring(numero from 8)::int), 0) + 1 INTO sig
    FROM public.expedientes WHERE numero ~ ('^' || pref || '[IE][0-9]+$');
  NEW.numero := pref || CASE WHEN NEW.tipo_operacion ILIKE 'export%' THEN 'E' ELSE 'I' END || sig::text;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_asignar_numero_expediente ON public.expedientes;
CREATE TRIGGER trg_asignar_numero_expediente BEFORE INSERT ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.asignar_numero_expediente();