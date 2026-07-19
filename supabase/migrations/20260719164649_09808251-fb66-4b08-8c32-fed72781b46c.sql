
-- PARTE 1: campos de contenido en programas_academia
ALTER TABLE public.programas_academia
  ADD COLUMN IF NOT EXISTS dirigido_a text,
  ADD COLUMN IF NOT EXISTS metodologia jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certificacion text,
  ADD COLUMN IF NOT EXISTS cantidad_encuentros integer,
  ADD COLUMN IF NOT EXISTS horas_por_encuentro numeric(5,1),
  ADD COLUMN IF NOT EXISTS temario jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_pago jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS descuento_referido_pct numeric(5,2) NOT NULL DEFAULT 0;

-- PARTE 2: referido en inscripciones
ALTER TABLE public.inscripciones
  ADD COLUMN IF NOT EXISTS referido_por_estudiante_id uuid REFERENCES public.estudiantes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_aplicado numeric(14,2) NOT NULL DEFAULT 0;

-- PARTE 3: enum de estado de cuota
DO $$ BEGIN
  CREATE TYPE public.cuota_estado AS ENUM ('pendiente', 'pagada', 'disputada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla de cuotas
CREATE TABLE IF NOT EXISTS public.inscripcion_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inscripcion_id uuid NOT NULL REFERENCES public.inscripciones(id) ON DELETE CASCADE,
  numero_cuota integer NOT NULL,
  descripcion text,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  monto_pagado numeric(14,2) NOT NULL DEFAULT 0,
  fecha_vencimiento date,
  fecha_pagada date,
  estado public.cuota_estado NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inscripcion_cuotas_inscripcion ON public.inscripcion_cuotas(inscripcion_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inscripcion_cuotas TO authenticated;
GRANT ALL ON public.inscripcion_cuotas TO service_role;

ALTER TABLE public.inscripcion_cuotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuotas_select" ON public.inscripcion_cuotas;
CREATE POLICY "cuotas_select" ON public.inscripcion_cuotas FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'academia'::app_role]));

DROP POLICY IF EXISTS "cuotas_insert" ON public.inscripcion_cuotas;
CREATE POLICY "cuotas_insert" ON public.inscripcion_cuotas FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'academia'::app_role]));

DROP POLICY IF EXISTS "cuotas_update" ON public.inscripcion_cuotas;
CREATE POLICY "cuotas_update" ON public.inscripcion_cuotas FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'academia'::app_role]));

DROP POLICY IF EXISTS "cuotas_delete" ON public.inscripcion_cuotas;
CREATE POLICY "cuotas_delete" ON public.inscripcion_cuotas FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role]));

-- Triggers estándar
DROP TRIGGER IF EXISTS touch_cuotas ON public.inscripcion_cuotas;
CREATE TRIGGER touch_cuotas BEFORE UPDATE ON public.inscripcion_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_cuotas ON public.inscripcion_cuotas;
CREATE TRIGGER audit_cuotas AFTER INSERT OR UPDATE OR DELETE ON public.inscripcion_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- PARTE 4: generación automática de cuotas al crear inscripción
CREATE OR REPLACE FUNCTION public.generar_cuotas_inscripcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan jsonb;
  v_item jsonb;
  v_num integer := 0;
  v_pct numeric;
  v_monto numeric;
BEGIN
  SELECT plan_pago INTO v_plan FROM public.programas_academia WHERE id = NEW.programa_id;
  IF v_plan IS NULL OR jsonb_typeof(v_plan) <> 'array' OR jsonb_array_length(v_plan) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    v_num := v_num + 1;
    v_pct := COALESCE((v_item->>'porcentaje')::numeric, 0);
    v_monto := ROUND(COALESCE(NEW.monto_total, 0) * v_pct / 100.0, 2);
    INSERT INTO public.inscripcion_cuotas (inscripcion_id, numero_cuota, descripcion, monto)
    VALUES (NEW.id, v_num, v_item->>'descripcion', v_monto);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generar_cuotas_after_insert ON public.inscripciones;
CREATE TRIGGER generar_cuotas_after_insert
  AFTER INSERT ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION public.generar_cuotas_inscripcion();

-- Auto-marcado de cuota pagada y sincronización del total de la inscripción
CREATE OR REPLACE FUNCTION public.cuota_auto_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.monto_pagado >= NEW.monto AND NEW.monto > 0 AND NEW.estado <> 'disputada' THEN
    NEW.estado := 'pagada';
    IF NEW.fecha_pagada IS NULL THEN NEW.fecha_pagada := CURRENT_DATE; END IF;
  ELSIF NEW.monto_pagado < NEW.monto AND NEW.estado = 'pagada' THEN
    NEW.estado := 'pendiente';
    NEW.fecha_pagada := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cuota_auto_estado_trg ON public.inscripcion_cuotas;
CREATE TRIGGER cuota_auto_estado_trg BEFORE INSERT OR UPDATE ON public.inscripcion_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.cuota_auto_estado();

CREATE OR REPLACE FUNCTION public.sync_inscripcion_pagado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric;
BEGIN
  v_id := COALESCE(NEW.inscripcion_id, OLD.inscripcion_id);
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_total
  FROM public.inscripcion_cuotas WHERE inscripcion_id = v_id;
  UPDATE public.inscripciones SET monto_pagado = v_total WHERE id = v_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_pagado_trg ON public.inscripcion_cuotas;
CREATE TRIGGER sync_pagado_trg AFTER INSERT OR UPDATE OR DELETE ON public.inscripcion_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.sync_inscripcion_pagado();
