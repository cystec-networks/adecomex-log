CREATE OR REPLACE FUNCTION public.sincronizar_contador_numeracion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pref text; maximo bigint;
BEGIN
 IF NEW.numero IS NULL OR NEW.numero !~ '^[0-9]{6}[IE][0-9]+$' THEN RETURN NULL; END IF;
 pref := substring(NEW.numero from 1 for 6);
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 SELECT coalesce(max(substring(numero from 8)::bigint),0) INTO maximo FROM (
  SELECT numero FROM public.expedientes UNION ALL SELECT numero FROM public.cotizaciones UNION ALL SELECT numero FROM public.ordenes
 ) x WHERE numero ~ ('^'||pref||'[IE][0-9]+$');
 INSERT INTO public.numeracion_operaciones_contadores(periodo,ultima_secuencia) VALUES(pref,maximo)
 ON CONFLICT(periodo) DO UPDATE SET ultima_secuencia=EXCLUDED.ultima_secuencia, updated_at=now();
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_contador_numeracion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_sincronizar_contador_expediente ON public.expedientes;
CREATE TRIGGER zz_sincronizar_contador_expediente AFTER INSERT OR UPDATE OF numero ON public.expedientes FOR EACH ROW EXECUTE FUNCTION public.sincronizar_contador_numeracion();
COMMENT ON FUNCTION public.sincronizar_contador_numeracion() IS 'Resets the monthly counter to the highest number actually used after any automatic or manual expediente number save.';