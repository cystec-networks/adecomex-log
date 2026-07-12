
ALTER TYPE public.transporte_estado ADD VALUE IF NOT EXISTS 'facturado';

DO $$ BEGIN
  CREATE TYPE public.transporte_pago_estado AS ENUM ('pendiente','parcial','pagado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.transportes
  ADD COLUMN IF NOT EXISTS costo_combustible numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_peajes numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_chofer numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_otros numeric(14,2),
  ADD COLUMN IF NOT EXISTS ingreso_facturado numeric(14,2),
  ADD COLUMN IF NOT EXISTS factura_numero text,
  ADD COLUMN IF NOT EXISTS factura_fecha date,
  ADD COLUMN IF NOT EXISTS pago_estado public.transporte_pago_estado DEFAULT 'pendiente';
