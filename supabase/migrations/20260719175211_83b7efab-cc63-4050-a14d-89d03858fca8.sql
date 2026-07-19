
-- PARTE 0
ALTER TABLE public.programas_academia ADD COLUMN IF NOT EXISTS enlace_classroom text;

-- PARTE 1: tabla estudiante_usuarios
CREATE TABLE IF NOT EXISTS public.estudiante_usuarios (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  estudiante_id uuid NOT NULL REFERENCES public.estudiantes(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estudiante_usuarios TO authenticated;
GRANT ALL ON public.estudiante_usuarios TO service_role;

ALTER TABLE public.estudiante_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Estudiante ve su propio vínculo"
  ON public.estudiante_usuarios FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "Admin inserta vínculo estudiante"
  ON public.estudiante_usuarios FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin actualiza vínculo estudiante"
  ON public.estudiante_usuarios FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin elimina vínculo estudiante"
  ON public.estudiante_usuarios FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS estudiante_usuarios_estudiante_id_idx ON public.estudiante_usuarios(estudiante_id);

-- Función auxiliar
CREATE OR REPLACE FUNCTION private.estudiante_ids_del_usuario(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT estudiante_id FROM public.estudiante_usuarios
  WHERE user_id = _user_id AND activo = true;
$$;

GRANT EXECUTE ON FUNCTION private.estudiante_ids_del_usuario(uuid) TO authenticated;

-- PARTE 2: vistas seguras (SIN security_invoker)
CREATE OR REPLACE VIEW public.v_inscripciones_estudiante AS
SELECT id, programa_id, estudiante_id, fecha_inscripcion, estado,
       monto_total, monto_pagado, created_at
FROM public.inscripciones
WHERE estudiante_id IN (SELECT private.estudiante_ids_del_usuario(auth.uid()));

CREATE OR REPLACE VIEW public.v_programas_estudiante AS
SELECT id, tipo, nombre, descripcion, modalidad, duracion_horas,
       cantidad_encuentros, horas_por_encuentro, dirigido_a, metodologia,
       certificacion, temario, fecha_inicio, fecha_fin, estado, enlace_classroom
FROM public.programas_academia;

CREATE OR REPLACE VIEW public.v_cuotas_estudiante AS
SELECT id, inscripcion_id, numero_cuota, descripcion, monto, monto_pagado,
       fecha_vencimiento, fecha_pagada, estado
FROM public.inscripcion_cuotas
WHERE inscripcion_id IN (
  SELECT id FROM public.inscripciones
  WHERE estudiante_id IN (SELECT private.estudiante_ids_del_usuario(auth.uid()))
);

GRANT SELECT ON public.v_inscripciones_estudiante TO authenticated;
GRANT SELECT ON public.v_programas_estudiante TO authenticated;
GRANT SELECT ON public.v_cuotas_estudiante TO authenticated;

COMMENT ON VIEW public.v_inscripciones_estudiante IS 'Vista de solo lectura para estudiante autenticado. SECURITY DEFINER intencional: acceso controlado por WHERE con private.estudiante_ids_del_usuario(auth.uid()).';
COMMENT ON VIEW public.v_programas_estudiante IS 'Info pública de programas (sin precio/cupo/plan_pago) para cualquier usuario autenticado.';
COMMENT ON VIEW public.v_cuotas_estudiante IS 'Cuotas del estudiante autenticado. SECURITY DEFINER intencional; acceso controlado por WHERE.';
