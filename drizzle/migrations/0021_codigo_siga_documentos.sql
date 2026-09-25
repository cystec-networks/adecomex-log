ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS codigo_siga text, ADD COLUMN IF NOT EXISTS file_hash text;
ALTER TABLE public.permisos ADD COLUMN IF NOT EXISTS codigo_siga text;
CREATE INDEX IF NOT EXISTS documentos_exp_hash_idx ON public.documentos (expediente_id, file_hash);
WITH d AS (
  SELECT id, expediente_id, CASE
    WHEN tipo = 'Factura comercial' THEN 'FAC'
    WHEN tipo IN ('Bill of Lading','Guía aérea') THEN 'DOE'
    WHEN tipo = 'Certificado de origen' THEN 'CEO'
    WHEN tipo IN ('Certificado sanitario','Certificado fitosanitario','Certificado de análisis','Permiso VUCE previo') THEN 'PER'
    ELSE 'OTD' END AS pre, created_at
  FROM public.documentos WHERE storage_path IS NOT NULL AND codigo_siga IS NULL AND expediente_id IS NOT NULL
), n AS (
  SELECT id, pre || '-' || lpad(row_number() OVER (PARTITION BY expediente_id, pre ORDER BY created_at)::text, 3, '0') AS cod FROM d
)
UPDATE public.documentos x SET codigo_siga = n.cod FROM n WHERE x.id = n.id;