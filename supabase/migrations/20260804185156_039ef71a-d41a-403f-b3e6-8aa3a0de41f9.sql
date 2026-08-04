CREATE TABLE public.recibos_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  salario_quincena numeric(14,2) NOT NULL DEFAULT 0,
  prestamo_id uuid REFERENCES public.empleado_prestamos(id) ON DELETE SET NULL,
  descuento_prestamo numeric(14,2) NOT NULL DEFAULT 0,
  afp_monto numeric(14,2) NOT NULL DEFAULT 0,
  ars_monto numeric(14,2) NOT NULL DEFAULT 0,
  isr_monto numeric(14,2) NOT NULL DEFAULT 0,
  otros_descuentos numeric(14,2) NOT NULL DEFAULT 0,
  otros_descuentos_concepto text,
  neto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  notas text,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibos_pago TO authenticated;
GRANT ALL ON public.recibos_pago TO service_role;

ALTER TABLE public.recibos_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recibos_pago_select" ON public.recibos_pago FOR SELECT TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "recibos_pago_insert" ON public.recibos_pago FOR INSERT TO authenticated
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "recibos_pago_update" ON public.recibos_pago FOR UPDATE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "recibos_pago_delete" ON public.recibos_pago FOR DELETE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE INDEX idx_recibos_pago_empleado ON public.recibos_pago(empleado_id);

CREATE TRIGGER recibos_pago_audit
AFTER INSERT OR UPDATE OR DELETE ON public.recibos_pago
FOR EACH ROW EXECUTE FUNCTION public.audit_log();