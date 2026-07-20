
-- Enums
CREATE TYPE public.empleado_estado AS ENUM ('activo','inactivo','baja');
CREATE TYPE public.tipo_contrato AS ENUM ('indefinido','tiempo_determinado','por_cierta_obra','entrenamiento');
CREATE TYPE public.documento_empleado_tipo AS ENUM ('cedula','contrato_firmado','inscripcion_tss','curriculum','referencias','certificado_medico','otros');

-- empleados
CREATE TABLE public.empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cedula text,
  fecha_nacimiento date,
  direccion text,
  telefono text,
  email text,
  cargo text,
  departamento text,
  fecha_ingreso date NOT NULL,
  fecha_baja date,
  motivo_baja text,
  tipo_contrato public.tipo_contrato NOT NULL DEFAULT 'indefinido',
  salario_base numeric(14,2),
  moneda text NOT NULL DEFAULT 'DOP',
  numero_tss text,
  afp text,
  ars text,
  estado public.empleado_estado NOT NULL DEFAULT 'activo',
  notas text,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados TO authenticated;
GRANT ALL ON public.empleados TO service_role;
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrhh_select_empleados" ON public.empleados FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_insert_empleados" ON public.empleados FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_update_empleados" ON public.empleados FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "admin_delete_empleados" ON public.empleados FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER empleados_touch_updated_at BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER empleados_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- empleado_documentos
CREATE TABLE public.empleado_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo public.documento_empleado_tipo NOT NULL,
  storage_path text,
  fecha_subida timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento date,
  notas text,
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleado_documentos TO authenticated;
GRANT ALL ON public.empleado_documentos TO service_role;
ALTER TABLE public.empleado_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrhh_select_emp_docs" ON public.empleado_documentos FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_insert_emp_docs" ON public.empleado_documentos FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_update_emp_docs" ON public.empleado_documentos FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "admin_delete_emp_docs" ON public.empleado_documentos FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

-- empleado_vacaciones
CREATE TABLE public.empleado_vacaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  dias_tomados integer NOT NULL,
  estado text NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada','aprobada','tomada','rechazada')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleado_vacaciones TO authenticated;
GRANT ALL ON public.empleado_vacaciones TO service_role;
ALTER TABLE public.empleado_vacaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrhh_select_emp_vac" ON public.empleado_vacaciones FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_insert_emp_vac" ON public.empleado_vacaciones FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "rrhh_update_emp_vac" ON public.empleado_vacaciones FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'rrhh'::app_role]));
CREATE POLICY "admin_delete_emp_vac" ON public.empleado_vacaciones FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

-- Función de cálculo de vacaciones (Ley 16-92)
CREATE OR REPLACE FUNCTION public.calcular_vacaciones_acumuladas(_fecha_ingreso date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN _fecha_ingreso IS NULL OR _fecha_ingreso > CURRENT_DATE THEN 0
    ELSE (
      LEAST(FLOOR(( (EXTRACT(YEAR FROM AGE(CURRENT_DATE, _fecha_ingreso))*12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, _fecha_ingreso)))::int ) / 12)::int, 4) * 14
      + GREATEST(FLOOR(( (EXTRACT(YEAR FROM AGE(CURRENT_DATE, _fecha_ingreso))*12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, _fecha_ingreso)))::int ) / 12)::int - 4, 0) * 18
    )
  END;
$$;
