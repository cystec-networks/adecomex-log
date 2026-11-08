-- Clave del documento enlazado: sitio + nombre del archivo (PDF/Word/Excel).
-- VUCE vuelve a publicar el mismo aviso bajo otra carpeta /media/<n>/, con otra
-- URL pero el mismo nombre de archivo. Nombres cortos y genéricos no cuentan.
CREATE OR REPLACE FUNCTION public.novedad_documento_clave(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH u AS (
    SELECT lower(regexp_replace(btrim(coalesce(p_url, '')), '[?#].*$', '')) AS s
  ), p AS (
    SELECT substring(s FROM '^https?://(?:www\.)?([^/:]+)') AS host,
           substring(s FROM '/([^/]+)\.(?:pdf|docx?|xlsx?)$') AS base,
           substring(s FROM '\.(pdf|docx?|xlsx?)$') AS ext
    FROM u
  )
  SELECT CASE
           WHEN host IS NOT NULL AND base IS NOT NULL AND length(base) >= 15
           THEN host || '/' || base || '.' || ext
         END
  FROM p
$$;

ALTER TABLE public.novedades_comercio_exterior
  ADD COLUMN documento_clave text GENERATED ALWAYS AS (public.novedad_documento_clave(url)) STORED,
  ADD COLUMN enlace_estado text CHECK (enlace_estado IS NULL OR enlace_estado IN ('ok', 'restringido', 'no_disponible')),
  ADD COLUMN enlace_codigo_http integer,
  ADD COLUMN enlace_es_pdf boolean,
  ADD COLUMN enlace_mensaje text,
  ADD COLUMN enlace_verificado_at timestamptz;

ALTER TABLE public.novedades_descartadas
  ADD COLUMN documento_clave text GENERATED ALWAYS AS (public.novedad_documento_clave(url)) STORED;
CREATE INDEX novedades_descartadas_documento_clave_idx
  ON public.novedades_descartadas (documento_clave) WHERE documento_clave IS NOT NULL;

-- Limpieza de duplicados ya guardados (mismo documento): se conserva el más
-- antiguo y hereda las marcas «Vista» de los demás.
CREATE TEMP TABLE _novedades_dup ON COMMIT DROP AS
SELECT id, first_value(id) OVER w AS conservar
FROM public.novedades_comercio_exterior
WHERE documento_clave IS NOT NULL
WINDOW w AS (PARTITION BY documento_clave ORDER BY created_at, fecha_captura, url_clave, id);

INSERT INTO public.novedades_vistas (user_id, novedad_id, vista_at)
SELECT v.user_id, d.conservar, min(v.vista_at)
FROM public.novedades_vistas v
JOIN _novedades_dup d ON d.id = v.novedad_id AND d.id <> d.conservar
GROUP BY v.user_id, d.conservar
ON CONFLICT (user_id, novedad_id) DO NOTHING;

DELETE FROM public.novedades_comercio_exterior n
USING _novedades_dup d
WHERE n.id = d.id AND d.id <> d.conservar;

CREATE UNIQUE INDEX novedades_comercio_exterior_documento_clave_key
  ON public.novedades_comercio_exterior (documento_clave) WHERE documento_clave IS NOT NULL;

-- Enlaces absolutos, sin espacios ni caracteres sin codificar.
ALTER TABLE public.novedades_comercio_exterior
  ADD CONSTRAINT novedades_url_absoluta_codificada CHECK (url ~ '^https?://[!-~]+$');