ALTER TABLE public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS ncf_proveedor text;