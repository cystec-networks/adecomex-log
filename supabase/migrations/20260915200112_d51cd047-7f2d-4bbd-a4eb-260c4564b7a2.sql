CREATE SEQUENCE IF NOT EXISTS public.solicitudes_pago_transferencia_seq;

CREATE TABLE public.solicitudes_pago_transferencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secuencia text NOT NULL UNIQUE DEFAULT ('TF-' || lpad(nextval('public.solicitudes_pago_transferencia_seq')::text, 6, '0')),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  categoria text NOT NULL,
  factura_compra text,
  beneficiario text NOT NULL,
  concepto text NOT NULL,
  monto numeric(14,2) NOT NULL,
  descuento_cxc numeric(14,2) DEFAULT 0,
  solicitud_transporte_id uuid REFERENCES public.solicitudes_pago_transporte(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES auth.users(id),
  eliminado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes_pago_transferencia TO authenticated;
GRANT ALL ON public.solicitudes_pago_transferencia TO service_role;
GRANT USAGE ON SEQUENCE public.solicitudes_pago_transferencia_seq TO authenticated, service_role;

ALTER TABLE public.solicitudes_pago_transferencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spt_staff" ON public.solicitudes_pago_transferencia FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));