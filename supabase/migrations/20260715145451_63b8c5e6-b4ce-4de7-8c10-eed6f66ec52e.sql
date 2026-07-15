
ALTER TABLE public.facturas_ecf
  ADD COLUMN IF NOT EXISTS itbis_retenido_terceros numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_percibido_venta numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta_terceros numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_percibido_venta numeric(14,2) NOT NULL DEFAULT 0;
