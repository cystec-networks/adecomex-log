
-- Enums
CREATE TYPE public.programa_tipo AS ENUM ('diplomado','curso','taller');
CREATE TYPE public.programa_estado AS ENUM ('planificado','activo','en_curso','finalizado','cancelado');
CREATE TYPE public.inscripcion_estado AS ENUM ('inscrito','en_curso','completado','retirado','cancelado');

-- programas_academia
CREATE TABLE public.programas_academia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.programa_tipo NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  modalidad text CHECK (modalidad IN ('virtual','presencial','mixta')) DEFAULT 'virtual',
  duracion_horas integer,
  precio numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  cupo_maximo integer,
  estado public.programa_estado NOT NULL DEFAULT 'planificado',
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas_academia TO authenticated;
GRANT ALL ON public.programas_academia TO service_role;
ALTER TABLE public.programas_academia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academia_select_programas" ON public.programas_academia FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_insert_programas" ON public.programas_academia FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_update_programas" ON public.programas_academia FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_delete_programas" ON public.programas_academia FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER touch_updated_at_programas BEFORE UPDATE ON public.programas_academia
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_programas AFTER INSERT OR UPDATE OR DELETE ON public.programas_academia
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- estudiantes
CREATE TABLE public.estudiantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cedula_pasaporte text,
  email text,
  telefono text,
  empresa text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estudiantes TO authenticated;
GRANT ALL ON public.estudiantes TO service_role;
ALTER TABLE public.estudiantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academia_select_estudiantes" ON public.estudiantes FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_insert_estudiantes" ON public.estudiantes FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_update_estudiantes" ON public.estudiantes FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_delete_estudiantes" ON public.estudiantes FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER touch_updated_at_estudiantes BEFORE UPDATE ON public.estudiantes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_estudiantes AFTER INSERT OR UPDATE OR DELETE ON public.estudiantes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- inscripciones
CREATE TABLE public.inscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES public.programas_academia(id) ON DELETE CASCADE,
  estudiante_id uuid NOT NULL REFERENCES public.estudiantes(id) ON DELETE CASCADE,
  fecha_inscripcion date NOT NULL DEFAULT CURRENT_DATE,
  estado public.inscripcion_estado NOT NULL DEFAULT 'inscrito',
  monto_total numeric(14,2) NOT NULL DEFAULT 0,
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  factura_ecf_id uuid REFERENCES public.facturas_ecf(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (programa_id, estudiante_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inscripciones TO authenticated;
GRANT ALL ON public.inscripciones TO service_role;
ALTER TABLE public.inscripciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academia_select_inscripciones" ON public.inscripciones FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_insert_inscripciones" ON public.inscripciones FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_update_inscripciones" ON public.inscripciones FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'academia'::app_role]));
CREATE POLICY "academia_delete_inscripciones" ON public.inscripciones FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

CREATE TRIGGER touch_updated_at_inscripciones BEFORE UPDATE ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_inscripciones AFTER INSERT OR UPDATE OR DELETE ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- Congelar precio al inscribirse
CREATE OR REPLACE FUNCTION public.inscripcion_freeze_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.monto_total IS NULL OR NEW.monto_total = 0 THEN
    SELECT precio INTO NEW.monto_total FROM public.programas_academia WHERE id = NEW.programa_id;
    IF NEW.monto_total IS NULL THEN NEW.monto_total := 0; END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inscripcion_freeze_precio() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER inscripcion_freeze_precio_bi BEFORE INSERT ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION public.inscripcion_freeze_precio();
