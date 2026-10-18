CREATE TABLE public.capitulo_notas (
 capitulo smallint PRIMARY KEY CHECK (capitulo BETWEEN 1 AND 97 AND capitulo <> 77),
 notas_texto text NOT NULL CHECK (length(btrim(notas_texto)) > 0),
 vigente_desde date NOT NULL DEFAULT '2022-01-01'
);
GRANT SELECT, INSERT, UPDATE ON public.capitulo_notas TO authenticated;
GRANT ALL ON public.capitulo_notas TO service_role;
ALTER TABLE public.capitulo_notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY capitulo_notas_staff_read ON public.capitulo_notas FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY capitulo_notas_admin_insert ON public.capitulo_notas FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin'));
CREATE POLICY capitulo_notas_admin_update ON public.capitulo_notas FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin'));
CREATE FUNCTION public.importar_capitulo_notas(_filas jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Solo Administrador puede importar notas por capítulo' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Se requiere una lista de filas'; END IF;
 IF jsonb_array_length(_filas)=0 OR jsonb_array_length(_filas)>96 THEN RAISE EXCEPTION 'Importa entre 1 y 96 capítulos válidos'; END IF;
 WITH guardadas AS (
 INSERT INTO public.capitulo_notas (capitulo, notas_texto)
 SELECT capitulo, notas_texto FROM jsonb_to_recordset(_filas) AS r(capitulo smallint, notas_texto text)
 ON CONFLICT (capitulo) DO UPDATE SET notas_texto=EXCLUDED.notas_texto
 RETURNING (xmax = 0) AS nueva
 ) SELECT jsonb_build_object('insertadas',count(*) FILTER (WHERE nueva),'actualizadas',count(*) FILTER (WHERE NOT nueva)) INTO resultado FROM guardadas;
 RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.importar_capitulo_notas(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_capitulo_notas(jsonb) TO authenticated, service_role;