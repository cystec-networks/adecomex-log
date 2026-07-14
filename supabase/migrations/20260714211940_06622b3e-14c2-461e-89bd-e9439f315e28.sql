
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS rnc_cedula_proveedor text,
  ADD COLUMN IF NOT EXISTS tipo_id_proveedor text,
  ADD COLUMN IF NOT EXISTS ncf_proveedor text,
  ADD COLUMN IF NOT EXISTS tipo_ncf_proveedor text,
  ADD COLUMN IF NOT EXISTS ncf_modificado text,
  ADD COLUMN IF NOT EXISTS monto_facturado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_facturado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_retenido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_retenido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pago text;

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_tipo_id_proveedor_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_tipo_id_proveedor_check
  CHECK (tipo_id_proveedor IS NULL OR tipo_id_proveedor IN ('RNC','CEDULA','PASAPORTE'));

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_forma_pago_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_forma_pago_check
  CHECK (forma_pago IS NULL OR forma_pago IN ('efectivo','cheque_transferencia','tarjeta','credito','permuta','nota_credito','mixto'));

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos (fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_rnc_cedula ON public.gastos (rnc_cedula_proveedor);

ALTER TABLE public.gastos_operativos
  ADD COLUMN IF NOT EXISTS rnc_cedula_proveedor text,
  ADD COLUMN IF NOT EXISTS tipo_id_proveedor text,
  ADD COLUMN IF NOT EXISTS ncf_proveedor text,
  ADD COLUMN IF NOT EXISTS tipo_ncf_proveedor text,
  ADD COLUMN IF NOT EXISTS ncf_modificado text,
  ADD COLUMN IF NOT EXISTS monto_facturado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_facturado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_retenido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_retenido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pago text;

ALTER TABLE public.gastos_operativos DROP CONSTRAINT IF EXISTS gastos_operativos_tipo_id_proveedor_check;
ALTER TABLE public.gastos_operativos ADD CONSTRAINT gastos_operativos_tipo_id_proveedor_check
  CHECK (tipo_id_proveedor IS NULL OR tipo_id_proveedor IN ('RNC','CEDULA','PASAPORTE'));

ALTER TABLE public.gastos_operativos DROP CONSTRAINT IF EXISTS gastos_operativos_forma_pago_check;
ALTER TABLE public.gastos_operativos ADD CONSTRAINT gastos_operativos_forma_pago_check
  CHECK (forma_pago IS NULL OR forma_pago IN ('efectivo','cheque_transferencia','tarjeta','credito','permuta','nota_credito','mixto'));

CREATE INDEX IF NOT EXISTS idx_gastos_op_fecha ON public.gastos_operativos (fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_op_rnc_cedula ON public.gastos_operativos (rnc_cedula_proveedor);
