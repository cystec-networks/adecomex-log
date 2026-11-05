CREATE OR REPLACE FUNCTION public.sincronizar_contador_numeracion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pref text; sec bigint;
BEGIN
 IF NEW.numero IS NULL OR NEW.numero !~ '^[0-9]{6}[IE][0-9]+$' THEN RETURN NULL; END IF;
 pref := substring(NEW.numero from 1 for 6);
 sec := substring(NEW.numero from 8)::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 INSERT INTO public.numeracion_operaciones_contadores(periodo,ultima_secuencia) VALUES(pref,sec)
 ON CONFLICT(periodo) DO UPDATE SET ultima_secuencia=EXCLUDED.ultima_secuencia;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.siguiente_numero_operacion(p_tipo text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pref text := to_char(now() AT TIME ZONE 'America/Santo_Domingo','YYYYMM'); letra text := CASE WHEN p_tipo ILIKE 'export%' THEN 'E' ELSE 'I' END; sig bigint; cand text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 SELECT ultima_secuencia INTO sig FROM public.numeracion_operaciones_contadores WHERE periodo=pref;
 sig := coalesce(sig,0);
 LOOP
  sig := sig+1; cand := pref||letra||sig::text;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.expedientes WHERE numero=cand)
   AND NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE numero=cand)
   AND NOT EXISTS(SELECT 1 FROM public.ordenes WHERE numero=cand);
 END LOOP;
 INSERT INTO public.numeracion_operaciones_contadores(periodo,ultima_secuencia) VALUES(pref,sig)
 ON CONFLICT(periodo) DO UPDATE SET ultima_secuencia=EXCLUDED.ultima_secuencia;
 RETURN cand;
END $$;
REVOKE ALL ON FUNCTION public.siguiente_numero_operacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_operacion(text) TO service_role;