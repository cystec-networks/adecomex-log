CREATE OR REPLACE FUNCTION public.siguiente_numero_expediente() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE referencia text; candidato text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 SELECT numero INTO referencia FROM public.numeracion_expedientes_referencia WHERE singleton;
 IF referencia IS NULL THEN RAISE EXCEPTION 'Escriba manualmente el primer número de Expediente para iniciar la numeración.' USING ERRCODE='22023'; END IF;
 candidato:=public.incrementar_numero_expediente(referencia);
 LOOP
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.expedientes WHERE numero=candidato)
   AND NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE numero=candidato)
   AND NOT EXISTS(SELECT 1 FROM public.ordenes WHERE numero=candidato);
  candidato:=public.incrementar_numero_expediente(candidato);
 END LOOP;
 RETURN candidato;
END $$;
REVOKE ALL ON FUNCTION public.siguiente_numero_expediente() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_expediente() TO service_role;
COMMENT ON FUNCTION public.siguiente_numero_expediente() IS 'Automatic unlinked expediente allocation: first unused suffix after last saved full number, serialized across all operations. Explicit manual numbers and inherited conversion numbers retain their existing uniqueness guards.';