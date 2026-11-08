CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ===================== PARTE A: Base normativa =====================
CREATE TABLE public.normativa_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  tipo text NOT NULL DEFAULT 'Otro'
    CHECK (tipo IN ('Ley', 'Reglamento', 'Decreto', 'Resolución', 'Norma general', 'Circular', 'Guía', 'Otro')),
  numero text,
  fecha_emision date,
  estado_vigencia text NOT NULL DEFAULT 'no_verificado'
    CHECK (estado_vigencia IN ('vigente', 'derogado', 'no_verificado')),
  fuente_url text CHECK (fuente_url IS NULL OR fuente_url ~* '^https?://'),
  notas text,
  archivo_path text,
  archivo_nombre text,
  archivo_bytes bigint,
  paginas integer,
  paginas_sin_texto integer,
  procesamiento_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (procesamiento_estado IN ('pendiente', 'procesando', 'listo', 'error', 'escaneado')),
  procesamiento_mensaje text,
  fragmentos_total integer NOT NULL DEFAULT 0,
  fragmentos_listos integer NOT NULL DEFAULT 0,
  procesado_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.normativa_documentos TO authenticated;
GRANT ALL ON public.normativa_documentos TO service_role;
ALTER TABLE public.normativa_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY nd_staff_lee_doc ON public.normativa_documentos FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY nd_admin_inserta_doc ON public.normativa_documentos FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nd_admin_actualiza_doc ON public.normativa_documentos FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nd_admin_elimina_doc ON public.normativa_documentos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER normativa_documentos_touch BEFORE UPDATE ON public.normativa_documentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.normativa_fragmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.normativa_documentos(id) ON DELETE CASCADE,
  orden integer NOT NULL,
  pagina_inicio integer NOT NULL,
  pagina_fin integer NOT NULL,
  articulo text,
  contenido text NOT NULL,
  embedding extensions.vector(3072),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX normativa_fragmentos_doc_orden_key ON public.normativa_fragmentos (documento_id, orden);
CREATE INDEX normativa_fragmentos_pendientes_idx ON public.normativa_fragmentos (documento_id, orden) WHERE embedding IS NULL;
CREATE INDEX normativa_fragmentos_embedding_idx ON public.normativa_fragmentos
  USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);
GRANT SELECT ON public.normativa_fragmentos TO authenticated;
GRANT ALL ON public.normativa_fragmentos TO service_role;
ALTER TABLE public.normativa_fragmentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY nf_staff_lee ON public.normativa_fragmentos FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

-- Búsqueda semántica con los permisos del usuario (RLS: solo staff).
CREATE OR REPLACE FUNCTION public.buscar_normativa(p_embedding extensions.vector(3072), p_limite integer DEFAULT 8)
RETURNS TABLE (
  fragmento_id uuid,
  documento_id uuid,
  titulo text,
  tipo text,
  numero text,
  fecha_emision date,
  estado_vigencia text,
  fuente_url text,
  pagina_inicio integer,
  pagina_fin integer,
  articulo text,
  contenido text,
  similitud double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT f.id, d.id, d.titulo, d.tipo, d.numero, d.fecha_emision, d.estado_vigencia, d.fuente_url,
         f.pagina_inicio, f.pagina_fin, f.articulo, f.contenido,
         1 - (f.embedding::halfvec(3072) <=> p_embedding::halfvec(3072))
    FROM public.normativa_fragmentos f
    JOIN public.normativa_documentos d ON d.id = f.documento_id
   WHERE f.embedding IS NOT NULL
   ORDER BY f.embedding::halfvec(3072) <=> p_embedding::halfvec(3072)
   LIMIT greatest(1, least(coalesce(p_limite, 8), 20))
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_normativa(extensions.vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_normativa(extensions.vector, integer) TO authenticated, service_role;

-- Guarda vectores de un lote (solo servidor).
CREATE OR REPLACE FUNCTION public.normativa_guardar_embeddings(p_lote jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE v integer;
BEGIN
  UPDATE public.normativa_fragmentos f
     SET embedding = (x->>'e')::vector(3072)
    FROM jsonb_array_elements(p_lote) x
   WHERE f.id = (x->>'id')::uuid;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END
$$;
REVOKE EXECUTE ON FUNCTION public.normativa_guardar_embeddings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normativa_guardar_embeddings(jsonb) TO service_role;

-- Archivos PDF de la base normativa: solo administradores.
CREATE POLICY base_normativa_admin_lee ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'base-normativa' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY base_normativa_admin_sube ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'base-normativa' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY base_normativa_admin_actualiza ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'base-normativa' AND private.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'base-normativa' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY base_normativa_admin_elimina ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'base-normativa' AND private.has_role(auth.uid(), 'admin'));

-- ===================== PARTE B: Clasificación de novedades =====================
ALTER TABLE public.novedades_comercio_exterior
  ADD COLUMN impacto text CHECK (impacto IS NULL OR impacto IN ('Arancel/Impuestos', 'Permisos', 'Plazos', 'Procedimiento', 'Tasas', 'Otro')),
  ADD COLUMN sectores text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (sectores <@ ARRAY['Cosméticos', 'Materias primas industriales', 'Ferretero', 'Lácteos', 'Agrícola', 'Agroquímica', 'General']::text[]),
  ADD COLUMN relevancia text CHECK (relevancia IS NULL OR relevancia IN ('Alta', 'Media', 'Baja'));
CREATE INDEX novedades_comercio_exterior_relevancia_idx
  ON public.novedades_comercio_exterior (relevancia, fecha_captura DESC) WHERE relevancia IN ('Alta', 'Media');

-- «Vista» por usuario: oculta la novedad de su Panel sin borrarla de la lista.
CREATE TABLE public.novedades_vistas (
  user_id uuid NOT NULL,
  novedad_id uuid NOT NULL REFERENCES public.novedades_comercio_exterior(id) ON DELETE CASCADE,
  vista_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novedad_id)
);
GRANT SELECT, INSERT, DELETE ON public.novedades_vistas TO authenticated;
GRANT ALL ON public.novedades_vistas TO service_role;
ALTER TABLE public.novedades_vistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY nv_propias_lee ON public.novedades_vistas FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY nv_propias_inserta ON public.novedades_vistas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_staff(auth.uid()));
CREATE POLICY nv_propias_elimina ON public.novedades_vistas FOR DELETE TO authenticated
  USING (user_id = auth.uid());