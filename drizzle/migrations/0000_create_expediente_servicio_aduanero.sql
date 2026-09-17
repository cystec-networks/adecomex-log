CREATE TABLE public.expediente_servicio_aduanero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo_despacho text NOT NULL,
  cantidad numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expediente_servicio_aduanero_exp ON public.expediente_servicio_aduanero (expediente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_servicio_aduanero TO authenticated;
GRANT ALL ON public.expediente_servicio_aduanero TO service_role;

ALTER TABLE public.expediente_servicio_aduanero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expediente_servicio_aduanero staff" ON public.expediente_servicio_aduanero
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

INSERT INTO public.expediente_servicio_aduanero (expediente_id, tipo_despacho, cantidad)
SELECT e.id, c.unidad, e.cantidad_despacho
FROM public.expedientes e
JOIN public.catalogo_tasa_servicio_aduanero c ON c.tipo_despacho = e.tipo_despacho_aduanero
WHERE e.tipo_despacho_aduanero IS NOT NULL
  AND e.cantidad_despacho IS NOT NULL
  AND e.cantidad_despacho > 0;