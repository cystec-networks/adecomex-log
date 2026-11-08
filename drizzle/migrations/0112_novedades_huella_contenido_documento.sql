-- Huella del documento enlazado: tamaño en bytes y SHA-256 del contenido sin
-- metadatos volátiles (fechas de modificación, /ID). Dos novedades con el
-- mismo nombre de archivo solo son la misma si su contenido coincide.
ALTER TABLE public.novedades_comercio_exterior
  ADD COLUMN documento_bytes bigint,
  ADD COLUMN documento_sha256 text;
ALTER TABLE public.novedades_descartadas
  ADD COLUMN documento_bytes bigint,
  ADD COLUMN documento_sha256 text;

COMMENT ON COLUMN public.novedades_comercio_exterior.documento_sha256 IS
  'SHA-256 del documento enlazado sin metadatos volátiles (ModDate, CreationDate, /ID, offsets xref).';

-- El nombre de archivo ya no basta: se permite el mismo nombre con contenido distinto.
DROP INDEX IF EXISTS public.novedades_comercio_exterior_documento_clave_key;
CREATE INDEX IF NOT EXISTS novedades_comercio_exterior_documento_clave_idx
  ON public.novedades_comercio_exterior (documento_clave) WHERE documento_clave IS NOT NULL;
CREATE UNIQUE INDEX novedades_comercio_exterior_documento_clave_sha_key
  ON public.novedades_comercio_exterior (documento_clave, documento_sha256)
  WHERE documento_clave IS NOT NULL AND documento_sha256 IS NOT NULL;