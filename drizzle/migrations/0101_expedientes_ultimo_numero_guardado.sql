CREATE TABLE public.numeracion_expedientes_referencia (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 numero text NOT NULL,
 actualizado_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT ALL ON public.numeracion_expedientes_referencia TO service_role;
ALTER TABLE public.numeracion_expedientes_referencia ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.numeracion_expedientes_referencia IS 'Full number of the last successfully saved expediente; no date/type series and no browser writes.';
INSERT INTO public.numeracion_expedientes_referencia(singleton,numero)
SELECT true,numero FROM public.expedientes WHERE numero IS NOT NULL
ORDER BY coalesce(updated_at,created_at) DESC,id DESC LIMIT 1;

CREATE FUNCTION public.incrementar_numero_expediente(p_numero text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE partes text[];
BEGIN
 partes:=regexp_match(p_numero,'^(.*[^0-9])?([0-9]+)$');
 IF partes IS NULL THEN RAISE EXCEPTION 'El último número guardado no termina en una secuencia numérica. Escriba el próximo número manualmente.' USING ERRCODE='22023'; END IF;
 RETURN coalesce(partes[1],'') || (partes[2]::numeric+1)::text;
END $$;
REVOKE ALL ON FUNCTION public.incrementar_numero_expediente(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.incrementar_numero_expediente(text) TO authenticated,service_role;

CREATE FUNCTION public.siguiente_numero_expediente() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE referencia text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 SELECT numero INTO referencia FROM public.numeracion_expedientes_referencia WHERE singleton;
 IF referencia IS NULL THEN RAISE EXCEPTION 'Escriba manualmente el primer número de Expediente para iniciar la numeración.' USING ERRCODE='22023'; END IF;
 RETURN public.incrementar_numero_expediente(referencia);
END $$;
REVOKE ALL ON FUNCTION public.siguiente_numero_expediente() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_expediente() TO service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_contador_numeracion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('numeracion-operaciones',0));
 INSERT INTO public.numeracion_expedientes_referencia(singleton,numero,actualizado_at)
 VALUES(true,NEW.numero,clock_timestamp())
 ON CONFLICT(singleton) DO UPDATE SET numero=EXCLUDED.numero,actualizado_at=EXCLUDED.actualizado_at;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_contador_numeracion() FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.sincronizar_contador_numeracion() IS 'Every successful expediente INSERT or UPDATE replaces the full-number reference, including saves without a number change.';
DROP TRIGGER zz_sincronizar_contador_expediente ON public.expedientes;
CREATE TRIGGER zz_sincronizar_contador_expediente AFTER INSERT OR UPDATE ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_contador_numeracion();

CREATE OR REPLACE FUNCTION public.asignar_numero_expediente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.orden_id IS NOT NULL THEN
  SELECT numero INTO NEW.numero FROM public.ordenes WHERE id=NEW.orden_id;
  IF NEW.numero IS NULL THEN RAISE EXCEPTION 'Orden de origen no disponible'; END IF;
 ELSIF NEW.numero IS NULL OR btrim(NEW.numero)='' OR NEW.numero LIKE 'EXP-%' THEN
  NEW.numero:=public.siguiente_numero_expediente();
 END IF;
 RETURN NEW;
END $$;
COMMENT ON TABLE public.numeracion_operaciones_contadores IS 'Monthly purchase quote/order counter only; expediente automatic numbers now use numeracion_expedientes_referencia.';