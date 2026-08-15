CREATE TABLE public.costos_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  concepto text NOT NULL,
  monto_estimado numeric(14,2) NOT NULL DEFAULT 0,
  monto_real numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.costos_producto TO authenticated;
GRANT ALL ON public.costos_producto TO service_role;

ALTER TABLE public.costos_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "costos_producto staff all" ON public.costos_producto
  FOR ALL TO authenticated USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX idx_costos_producto_expediente ON public.costos_producto(expediente_id);