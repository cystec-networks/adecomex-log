ALTER TABLE public.solicitudes_pago_transporte
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_salida date,
  ADD COLUMN IF NOT EXISTS eta date,
  ADD COLUMN IF NOT EXISTS estado_transporte text DEFAULT 'programado';

ALTER TABLE public.transportes
  ADD COLUMN IF NOT EXISTS venta_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS venta_moneda text DEFAULT 'DOP',
  ADD COLUMN IF NOT EXISTS venta_numero_factura text;