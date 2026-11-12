ALTER TABLE public.catalogo_conceptos_gasto
  ADD COLUMN IF NOT EXISTS es_reembolso_defecto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.catalogo_conceptos_gasto.es_reembolso_defecto IS 'Valor inicial del interruptor "Es reembolso" al elegir este concepto en un gasto; el usuario puede cambiarlo antes de guardar.';
UPDATE public.catalogo_conceptos_gasto SET es_reembolso_defecto = true WHERE codigo = 'REE';