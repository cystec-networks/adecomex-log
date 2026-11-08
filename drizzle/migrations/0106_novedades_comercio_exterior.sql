CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Clave de deduplicación de enlaces: sin esquema, sin www, sin fragmento ni barra final.
CREATE OR REPLACE FUNCTION public.novedad_url_clave(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(lower(btrim(coalesce(p_url, ''))), '^https?://(www\.)?', ''),
             '#.*$', ''),
           '/+$', '')
$$;

CREATE TABLE public.fuentes_novedades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  url text NOT NULL CHECK (length(btrim(url)) > 0),
  tipo text NOT NULL DEFAULT 'web' CHECK (tipo IN ('web', 'rss', 'manual')),
  activa boolean NOT NULL DEFAULT true,
  notas text,
  ultima_revision timestamptz,
  ultimo_estado text NOT NULL DEFAULT 'sin_revisar'
    CHECK (ultimo_estado IN ('sin_revisar', 'ok', 'sin_novedades', 'error', 'no_legible')),
  ultimo_mensaje text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuentes_novedades TO authenticated;
GRANT ALL ON public.fuentes_novedades TO service_role;
ALTER TABLE public.fuentes_novedades ENABLE ROW LEVEL SECURITY;
CREATE POLICY fn_staff_lee ON public.fuentes_novedades FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY fn_admin_inserta ON public.fuentes_novedades FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY fn_admin_actualiza ON public.fuentes_novedades FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY fn_admin_elimina ON public.fuentes_novedades FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER fuentes_novedades_touch BEFORE UPDATE ON public.fuentes_novedades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.novedades_comercio_exterior (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  resumen text NOT NULL CHECK (length(btrim(resumen)) > 0),
  fecha_publicacion date,
  fuente_id uuid REFERENCES public.fuentes_novedades(id) ON DELETE SET NULL,
  fuente_nombre text NOT NULL CHECK (length(btrim(fuente_nombre)) > 0),
  url text NOT NULL CHECK (url ~* '^https?://'),
  url_clave text GENERATED ALWAYS AS (public.novedad_url_clave(url)) STORED,
  categoria text NOT NULL CHECK (categoria IN ('Aduanas', 'Aranceles/Impuestos', 'Permisos/VUCE', 'Normativa', 'Logística', 'Mercado')),
  origen text NOT NULL DEFAULT 'automatica' CHECK (origen IN ('automatica', 'manual')),
  fecha_captura timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX novedades_comercio_exterior_url_clave_key ON public.novedades_comercio_exterior (url_clave);
CREATE INDEX novedades_comercio_exterior_fecha_idx
  ON public.novedades_comercio_exterior (fecha_publicacion DESC NULLS LAST, fecha_captura DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.novedades_comercio_exterior TO authenticated;
GRANT ALL ON public.novedades_comercio_exterior TO service_role;
ALTER TABLE public.novedades_comercio_exterior ENABLE ROW LEVEL SECURITY;
CREATE POLICY nce_staff_lee ON public.novedades_comercio_exterior FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY nce_admin_inserta ON public.novedades_comercio_exterior FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nce_admin_actualiza ON public.novedades_comercio_exterior FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nce_admin_elimina ON public.novedades_comercio_exterior FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER novedades_comercio_exterior_touch BEFORE UPDATE ON public.novedades_comercio_exterior
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Publicaciones revisadas y descartadas por no tratar de comercio exterior (evita reevaluarlas cada día).
CREATE TABLE public.novedades_descartadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente_id uuid REFERENCES public.fuentes_novedades(id) ON DELETE CASCADE,
  url text NOT NULL,
  url_clave text GENERATED ALWAYS AS (public.novedad_url_clave(url)) STORED,
  titulo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX novedades_descartadas_url_clave_key ON public.novedades_descartadas (url_clave);
GRANT SELECT, DELETE ON public.novedades_descartadas TO authenticated;
GRANT ALL ON public.novedades_descartadas TO service_role;
ALTER TABLE public.novedades_descartadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY nd_admin_lee ON public.novedades_descartadas FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nd_admin_elimina ON public.novedades_descartadas FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- Estado único de la revisión automática (bloqueo, pausa y último resultado).
CREATE TABLE public.novedades_revision_estado (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pausado')),
  pausa_tipo text CHECK (pausa_tipo IN ('creditos', 'acceso')),
  motivo_pausa text,
  lock_hasta timestamptz,
  ultima_ejecucion timestamptz,
  ultimo_resultado jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.novedades_revision_estado (id) VALUES (1);
GRANT SELECT, UPDATE ON public.novedades_revision_estado TO authenticated;
GRANT ALL ON public.novedades_revision_estado TO service_role;
ALTER TABLE public.novedades_revision_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY nre_admin_lee ON public.novedades_revision_estado FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY nre_admin_actualiza ON public.novedades_revision_estado FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER novedades_revision_estado_touch BEFORE UPDATE ON public.novedades_revision_estado
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Token privado que presenta la tarea programada (nunca expuesto por la API).
CREATE TABLE private.novedades_cron_token (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
INSERT INTO private.novedades_cron_token (id) VALUES (1);
REVOKE ALL ON private.novedades_cron_token FROM PUBLIC, anon, authenticated;
ALTER TABLE private.novedades_cron_token ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.novedades_token_valido(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(length(p_token), 0) >= 32
     AND EXISTS (SELECT 1 FROM private.novedades_cron_token t WHERE t.id = 1 AND t.token = p_token)
$$;
REVOKE EXECUTE ON FUNCTION public.novedades_token_valido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.novedades_token_valido(text) TO service_role;

CREATE OR REPLACE FUNCTION public.novedades_tomar_lock(p_minutos integer DEFAULT 15)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v integer;
BEGIN
  UPDATE public.novedades_revision_estado
     SET lock_hasta = now() + make_interval(mins => greatest(1, least(p_minutos, 60)))
   WHERE id = 1 AND (lock_hasta IS NULL OR lock_hasta < now());
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v = 1;
END
$$;
REVOKE EXECUTE ON FUNCTION public.novedades_tomar_lock(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.novedades_tomar_lock(integer) TO service_role;

-- Fuentes sugeridas para que el administrador las verifique.
INSERT INTO public.fuentes_novedades (nombre, url, tipo, activa, notas) VALUES
  ('DGA · Dirección General de Aduanas', 'https://www.aduanas.gob.do/noticias/', 'web', true, 'Sugerida: sección de noticias. Verificar.'),
  ('VUCE · Ventanilla Única de Comercio Exterior', 'https://vucerd.gob.do/de-inter%C3%A9s/avisos/', 'web', true, 'Sugerida: avisos (en su mayoría PDF; se resume por el título). Verificar.'),
  ('DGII · Dirección General de Impuestos Internos', 'https://dgii.gov.do/noticias/Paginas/default.aspx', 'web', true, 'Sugerida: noticias. Verificar.'),
  ('Ministerio de Hacienda', 'https://www.hacienda.gob.do/', 'web', true, 'Sugerida. En la prueba inicial el sitio rechazó la lectura automática; si sigue así, cargar novedades manualmente.'),
  ('Gaceta Oficial (Consultoría Jurídica del Poder Ejecutivo)', 'https://www.consultoria.gov.do/noticias', 'web', true, 'Sugerida: noticias de leyes y decretos promulgados. La consulta de Gacetas no se puede leer automáticamente.'),
  ('MICM · Ministerio de Industria, Comercio y Mipymes', 'https://micm.gob.do/feed/', 'rss', true, 'Sugerida: canal RSS oficial. Verificar.');

INSERT INTO public.asistente_preguntas_frecuentes (pregunta, orden, activo)
SELECT '¿Qué novedades recientes hay en aduanas y comercio exterior?', coalesce(max(orden), 0) + 1, true
FROM public.asistente_preguntas_frecuentes;