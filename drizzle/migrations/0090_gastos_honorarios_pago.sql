ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS pago_estado text NOT NULL DEFAULT 'pendiente' CHECK (pago_estado IN ('pendiente','pagado'));
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS fecha_pago date;
CREATE INDEX IF NOT EXISTS gastos_concepto_idx ON public.gastos (concepto) WHERE deleted_at IS NULL;