ALTER TABLE public.solicitudes_correo
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS peso_bruto_kg numeric,
  ADD COLUMN IF NOT EXISTS factura_comercial text;