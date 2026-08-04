CREATE TYPE public.prestamo_estado AS ENUM ('activo','pagado','cancelado');

CREATE TABLE public.empleado_prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  monto_prestado numeric(14,2) NOT NULL DEFAULT 0,
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  fecha_prestamo date NOT NULL DEFAULT current_date,
  motivo text,
  estado public.prestamo_estado NOT NULL DEFAULT 'activo',
  notas text,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleado_prestamos TO authenticated;
GRANT ALL ON public.empleado_prestamos TO service_role;

ALTER TABLE public.empleado_prestamos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prestamos_select" ON public.empleado_prestamos
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "prestamos_insert" ON public.empleado_prestamos
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "prestamos_update" ON public.empleado_prestamos
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "prestamos_delete" ON public.empleado_prestamos
  FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER prestamos_touch_updated_at
  BEFORE UPDATE ON public.empleado_prestamos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER prestamos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.empleado_prestamos
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE OR REPLACE FUNCTION public.prestamo_auto_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado = 'activo' AND NEW.monto_pagado >= NEW.monto_prestado AND NEW.monto_prestado > 0 THEN
    NEW.estado := 'pagado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prestamos_auto_estado
  BEFORE UPDATE ON public.empleado_prestamos
  FOR EACH ROW EXECUTE FUNCTION public.prestamo_auto_estado();