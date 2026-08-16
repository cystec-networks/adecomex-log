UPDATE public.expedientes e
   SET pais_procedencia = dp.pais
  FROM public.dga_paises dp
 WHERE e.pais_procedencia_codigo = dp.codigo
   AND e.pais_procedencia IS NULL
   AND e.pais_procedencia_codigo IS NOT NULL;

ALTER TABLE public.facturas_ecf ADD COLUMN IF NOT EXISTS fecha_vencimiento_pago date;

CREATE TABLE public.cxc_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.facturas_ecf(id) ON DELETE CASCADE,
  monto numeric(14,2) NOT NULL,
  fecha_pago date NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago text,
  referencia text,
  notas text,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cxc_pagos TO authenticated;
GRANT ALL ON public.cxc_pagos TO service_role;
ALTER TABLE public.cxc_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cxc_pagos select" ON public.cxc_pagos FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "cxc_pagos insert" ON public.cxc_pagos FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "cxc_pagos update" ON public.cxc_pagos FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "cxc_pagos delete" ON public.cxc_pagos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_cxc_pagos_factura ON public.cxc_pagos(factura_id);