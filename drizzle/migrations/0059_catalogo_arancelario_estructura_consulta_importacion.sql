CREATE TABLE public.catalogo_arancelario (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE, codigo_partida text NOT NULL, descripcion text NOT NULL,
 capitulo smallint NOT NULL CHECK (capitulo BETWEEN 1 AND 97), capitulo_titulo text NOT NULL, seccion text NOT NULL,
 gravamen_pct numeric NULL, exento_itbis boolean NULL, nivel smallint NOT NULL, es_hoja boolean NOT NULL,
 notas_legales text NULL, requiere_permiso boolean NOT NULL DEFAULT false, vigente_desde date NOT NULL DEFAULT '2022-01-01', activo boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.catalogo_arancelario TO authenticated;
GRANT ALL ON public.catalogo_arancelario TO service_role;
ALTER TABLE public.catalogo_arancelario ENABLE ROW LEVEL SECURITY;
CREATE POLICY arancel_staff_read ON public.catalogo_arancelario FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY arancel_admin_insert ON public.catalogo_arancelario FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin'));
CREATE POLICY arancel_admin_update ON public.catalogo_arancelario FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin'));
CREATE INDEX catalogo_arancelario_partida_idx ON public.catalogo_arancelario(codigo_partida);
CREATE INDEX catalogo_arancelario_capitulo_idx ON public.catalogo_arancelario(capitulo);
CREATE INDEX catalogo_arancelario_descripcion_idx ON public.catalogo_arancelario USING gin (descripcion public.gin_trgm_ops);
CREATE TRIGGER catalogo_arancelario_updated_at BEFORE UPDATE ON public.catalogo_arancelario FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE FUNCTION public.importar_catalogo_arancelario(_filas jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cantidad integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Solo Administrador puede importar el catálogo arancelario' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Se requiere una lista de filas'; END IF;
 IF jsonb_array_length(_filas)=0 OR jsonb_array_length(_filas)>20000 THEN RAISE EXCEPTION 'Importa entre 1 y 20000 filas por archivo'; END IF;
 INSERT INTO public.catalogo_arancelario (codigo,codigo_partida,descripcion,capitulo,capitulo_titulo,seccion,gravamen_pct,exento_itbis,nivel,es_hoja,notas_legales,requiere_permiso,vigente_desde,activo)
 SELECT codigo,codigo_partida,descripcion,capitulo,capitulo_titulo,seccion,gravamen_pct,exento_itbis,nivel,es_hoja,notas_legales,coalesce(requiere_permiso,false),coalesce(vigente_desde,'2022-01-01'::date),coalesce(activo,true)
 FROM jsonb_to_recordset(_filas) AS r(codigo text,codigo_partida text,descripcion text,capitulo smallint,capitulo_titulo text,seccion text,gravamen_pct numeric,exento_itbis boolean,nivel smallint,es_hoja boolean,notas_legales text,requiere_permiso boolean,vigente_desde date,activo boolean)
 ON CONFLICT (codigo) DO UPDATE SET codigo_partida=EXCLUDED.codigo_partida,descripcion=EXCLUDED.descripcion,capitulo=EXCLUDED.capitulo,capitulo_titulo=EXCLUDED.capitulo_titulo,seccion=EXCLUDED.seccion,gravamen_pct=EXCLUDED.gravamen_pct,exento_itbis=EXCLUDED.exento_itbis,nivel=EXCLUDED.nivel,es_hoja=EXCLUDED.es_hoja,notas_legales=EXCLUDED.notas_legales,requiere_permiso=EXCLUDED.requiere_permiso,vigente_desde=EXCLUDED.vigente_desde,activo=EXCLUDED.activo;
 GET DIAGNOSTICS cantidad=ROW_COUNT;
 RETURN cantidad;
END;
$$;
REVOKE ALL ON FUNCTION public.importar_catalogo_arancelario(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_catalogo_arancelario(jsonb) TO authenticated, service_role;