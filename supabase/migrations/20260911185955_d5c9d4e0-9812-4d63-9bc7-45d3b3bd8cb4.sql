ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS producto text,
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS destino text,
  ADD COLUMN IF NOT EXISTS puerto_destino text,
  ADD COLUMN IF NOT EXISTS buque text,
  ADD COLUMN IF NOT EXISTS peso_bruto_kg numeric(14,3),
  ADD COLUMN IF NOT EXISTS volumen_m3 numeric(14,3),
  ADD COLUMN IF NOT EXISTS incoterm text,
  ADD COLUMN IF NOT EXISTS proveedor_email text,
  ADD COLUMN IF NOT EXISTS proveedor_telefono text;

CREATE TABLE IF NOT EXISTS public.logistica_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_logistica_id uuid NOT NULL REFERENCES public.operaciones_logistica(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nombre_archivo text,
  documento_url text,
  subido_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistica_documentos TO authenticated;
GRANT ALL ON public.logistica_documentos TO service_role;
ALTER TABLE public.logistica_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logistica_documentos staff" ON public.logistica_documentos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]));

CREATE INDEX IF NOT EXISTS idx_logistica_documentos_operacion ON public.logistica_documentos(operacion_logistica_id);

INSERT INTO public.logistica_documentos (operacion_logistica_id, tipo, nombre_archivo, documento_url)
SELECT id, 'otro', regexp_replace(documento_url, '^.*/', ''), documento_url
FROM public.operaciones_logistica
WHERE documento_url IS NOT NULL AND documento_url <> '';

ALTER TABLE public.operaciones_logistica DROP COLUMN IF EXISTS documento_url;