CREATE TYPE public.prestamo_tercero_estado AS ENUM ('activo','pagado','cancelado');

CREATE TABLE public.prestamos_terceros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_deudor text NOT NULL,
  telefono text,
  relacion text,
  monto_prestado numeric(14,2) NOT NULL DEFAULT 0,
  tasa_interes_pct numeric(6,3) NOT NULL DEFAULT 0,
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  fecha_prestamo date NOT NULL DEFAULT current_date,
  estado public.prestamo_tercero_estado NOT NULL DEFAULT 'activo',
  notas text,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestamos_terceros TO authenticated;
GRANT ALL ON public.prestamos_terceros TO service_role;

ALTER TABLE public.prestamos_terceros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_select" ON public.prestamos_terceros FOR SELECT TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "pt_insert" ON public.prestamos_terceros FOR INSERT TO authenticated
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "pt_update" ON public.prestamos_terceros FOR UPDATE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));

CREATE POLICY "pt_delete" ON public.prestamos_terceros FOR DELETE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER prestamos_terceros_touch_updated_at
BEFORE UPDATE ON public.prestamos_terceros
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER prestamos_terceros_audit
AFTER INSERT OR UPDATE OR DELETE ON public.prestamos_terceros
FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE OR REPLACE FUNCTION public.calcular_interes_prestamo_tercero(_monto numeric, _tasa_pct numeric, _fecha_prestamo date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _fecha_prestamo IS NULL OR _fecha_prestamo > CURRENT_DATE THEN 0::numeric
    ELSE ROUND(COALESCE(_monto,0) * (COALESCE(_tasa_pct,0)/100.0) * ((CURRENT_DATE - _fecha_prestamo)::numeric / 30.0), 2)
  END;
$$;