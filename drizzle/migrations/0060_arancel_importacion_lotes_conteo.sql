ALTER TABLE public.catalogo_arancelario ALTER COLUMN capitulo DROP NOT NULL;
ALTER TABLE public.catalogo_arancelario DROP CONSTRAINT catalogo_arancelario_capitulo_check;
ALTER TABLE public.catalogo_arancelario ADD CONSTRAINT catalogo_arancelario_capitulo_check CHECK (capitulo IS NULL OR capitulo BETWEEN 1 AND 97);
DROP FUNCTION public.importar_catalogo_arancelario(jsonb);
CREATE FUNCTION public.importar_catalogo_arancelario(_filas jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Solo Administrador puede importar el catálogo arancelario' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Se requiere una lista de filas'; END IF;
 IF jsonb_array_length(_filas)=0 OR jsonb_array_length(_filas)>20000 THEN RAISE EXCEPTION 'Importa entre 1 y 20000 filas por archivo'; END IF;
 WITH escrito AS (
  INSERT INTO public.catalogo_arancelario (codigo,codigo_partida,descripcion,capitulo,capitulo_titulo,seccion,gravamen_pct,exento_itbis,nivel,es_hoja,notas_legales,requiere_permiso,vigente_desde,activo)
  SELECT codigo,codigo_partida,descripcion,capitulo,capitulo_titulo,seccion,gravamen_pct,exento_itbis,nivel,es_hoja,notas_legales,coalesce(requiere_permiso,false),coalesce(vigente_desde,'2022-01-01'::date),coalesce(activo,true)
  FROM jsonb_to_recordset(_filas) AS r(codigo text,codigo_partida text,descripcion text,capitulo smallint,capitulo_titulo text,seccion text,gravamen_pct numeric,exento_itbis boolean,nivel smallint,es_hoja boolean,notas_legales text,requiere_permiso boolean,vigente_desde date,activo boolean)
  ON CONFLICT (codigo) DO UPDATE SET codigo_partida=EXCLUDED.codigo_partida,descripcion=EXCLUDED.descripcion,capitulo=EXCLUDED.capitulo,capitulo_titulo=EXCLUDED.capitulo_titulo,seccion=EXCLUDED.seccion,gravamen_pct=EXCLUDED.gravamen_pct,exento_itbis=EXCLUDED.exento_itbis,nivel=EXCLUDED.nivel,es_hoja=EXCLUDED.es_hoja,notas_legales=EXCLUDED.notas_legales,requiere_permiso=EXCLUDED.requiere_permiso,vigente_desde=EXCLUDED.vigente_desde,activo=EXCLUDED.activo
  RETURNING (xmax = 0) AS insertada
 )
 SELECT jsonb_build_object('insertadas', count(*) FILTER (WHERE insertada), 'actualizadas', count(*) FILTER (WHERE NOT insertada)) INTO resultado FROM escrito;
 RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.importar_catalogo_arancelario(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_catalogo_arancelario(jsonb) TO authenticated, service_role;