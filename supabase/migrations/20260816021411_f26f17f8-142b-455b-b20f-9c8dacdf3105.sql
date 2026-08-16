ALTER TABLE public.cxc_pagos
  ADD COLUMN IF NOT EXISTS es_retencion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lote_pago uuid;

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_lote ON public.cxc_pagos(lote_pago);