ALTER TABLE public.solicitudes_pago_transporte
  ADD COLUMN IF NOT EXISTS descuento_cxc numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factura_costo_numero text,
  ADD COLUMN IF NOT EXISTS factura_costo_fecha date;

COMMENT ON COLUMN public.solicitudes_pago_transporte.descuento_cxc IS 'Descuento por cuentas por cobrar a aplicar al pago del transportista';
COMMENT ON COLUMN public.solicitudes_pago_transporte.factura_costo_numero IS 'Número de factura de costo asociada al viaje';
COMMENT ON COLUMN public.solicitudes_pago_transporte.factura_costo_fecha IS 'Fecha de factura de costo asociada al viaje';