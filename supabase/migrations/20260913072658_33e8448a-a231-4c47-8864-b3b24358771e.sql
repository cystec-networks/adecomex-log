ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS es_mercancia_peligrosa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hazmat_un_numero text,
  ADD COLUMN IF NOT EXISTS hazmat_clase text,
  ADD COLUMN IF NOT EXISTS hazmat_grupo_empaque text,
  ADD COLUMN IF NOT EXISTS hazmat_punto_inflamacion text,
  ADD COLUMN IF NOT EXISTS hazmat_contaminante_marino boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hazmat_nombre_tecnico text;

-- Actualizar timestamps si existen
COMMENT ON COLUMN public.operaciones_logistica.es_mercancia_peligrosa IS 'Indica si la carga es mercancía peligrosa (Hazmat)';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_un_numero IS 'Número ONU de mercancía peligrosa, ej. UN 3077';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_clase IS 'Clase de peligrosidad, ej. 9';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_grupo_empaque IS 'Grupo de empaque, ej. PG III';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_punto_inflamacion IS 'Punto de inflamación, ej. N/A';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_contaminante_marino IS 'Indica si es contaminante marino (IMDG)';
COMMENT ON COLUMN public.operaciones_logistica.hazmat_nombre_tecnico IS 'Nombre técnico apropiado para transporte';

SELECT 1;