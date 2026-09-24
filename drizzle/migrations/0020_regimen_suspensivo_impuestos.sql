ALTER TABLE public.catalogo_regimenes ADD COLUMN IF NOT EXISTS suspensivo_impuestos boolean NOT NULL DEFAULT false;
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS impuestos_override_manual boolean NOT NULL DEFAULT false;
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS impuestos_override_at timestamptz;
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS impuestos_override_por uuid;