
DO $$ BEGIN
  CREATE TYPE public.cxp_estado AS ENUM ('pendiente','parcial','pagado','disputado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.cuentas_por_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL,
  gasto_operativo_id uuid REFERENCES public.gastos_operativos(id) ON DELETE SET NULL,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  proveedor_nombre text NOT NULL,
  proveedor_rnc text,
  monto_total numeric(14,2) NOT NULL DEFAULT 0,
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP' CHECK (moneda IN ('DOP','USD','EUR')),
  fecha_factura date,
  fecha_vencimiento date,
  estado public.cxp_estado NOT NULL DEFAULT 'pendiente',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_por_pagar TO authenticated;
GRANT ALL ON public.cuentas_por_pagar TO service_role;

ALTER TABLE public.cuentas_por_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY cuentas_por_pagar_select ON public.cuentas_por_pagar
  FOR SELECT USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY cuentas_por_pagar_insert ON public.cuentas_por_pagar
  FOR INSERT WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY cuentas_por_pagar_update ON public.cuentas_por_pagar
  FOR UPDATE USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));
CREATE POLICY cuentas_por_pagar_delete ON public.cuentas_por_pagar
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_cxp_fecha_vencimiento ON public.cuentas_por_pagar(fecha_vencimiento);
CREATE INDEX idx_cxp_estado ON public.cuentas_por_pagar(estado);

CREATE TRIGGER cxp_touch_updated_at
  BEFORE UPDATE ON public.cuentas_por_pagar
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER cxp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cuentas_por_pagar
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();
