-- 1) Nuevo rol Vendedor
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- 2) Estado de cotización
DO $$ BEGIN
  CREATE TYPE public.cotizacion_estado AS ENUM ('solicitada','en_proceso','cotizada','aprobada','rechazada','expirada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Secuencias de numeración
CREATE SEQUENCE IF NOT EXISTS public.cotizaciones_seq;
CREATE SEQUENCE IF NOT EXISTS public.ordenes_seq;

-- 4) Tabla cotizaciones
CREATE TABLE public.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  vendedor_id uuid,
  tipo_mercancia text,
  origen text,
  destino text,
  incoterm text,
  peso_kg numeric,
  volumen_m3 numeric,
  tarifa_propuesta numeric,
  moneda public.moneda NOT NULL DEFAULT 'USD',
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vigencia date,
  notas text,
  estado public.cotizacion_estado NOT NULL DEFAULT 'solicitada',
  orden_id uuid,
  eliminado_en timestamptz,
  eliminado_por uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;
GRANT ALL ON public.cotizaciones TO service_role;
GRANT USAGE ON SEQUENCE public.cotizaciones_seq TO authenticated, service_role;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff autenticado puede ver cotizaciones"
  ON public.cotizaciones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Vendedores y admin pueden crear cotizaciones"
  ON public.cotizaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')));

CREATE POLICY "Vendedores y admin pueden editar cotizaciones"
  ON public.cotizaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')));

CREATE POLICY "Solo admin puede borrar cotizaciones definitivamente"
  ON public.cotizaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

-- 5) Tabla ordenes (base; se ampliará en el próximo módulo)
CREATE TABLE public.ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  cotizacion_id uuid UNIQUE REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  vendedor_id uuid,
  estado text NOT NULL DEFAULT 'abierta',
  notas text,
  -- Snapshot de la cotización original (solo lectura)
  cot_numero text,
  cot_tipo_mercancia text,
  cot_origen text,
  cot_destino text,
  cot_incoterm text,
  cot_peso_kg numeric,
  cot_volumen_m3 numeric,
  cot_tarifa_propuesta numeric,
  cot_moneda public.moneda,
  cot_fecha_emision date,
  cot_fecha_vigencia date,
  cot_notas text,
  eliminado_en timestamptz,
  eliminado_por uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes TO authenticated;
GRANT ALL ON public.ordenes TO service_role;
GRANT USAGE ON SEQUENCE public.ordenes_seq TO authenticated, service_role;
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff autenticado puede ver ordenes"
  ON public.ordenes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Vendedores y admin pueden crear ordenes"
  ON public.ordenes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')));

CREATE POLICY "Vendedores y admin pueden editar ordenes"
  ON public.ordenes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin','vendedor')));

CREATE POLICY "Solo admin puede borrar ordenes definitivamente"
  ON public.ordenes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

ALTER TABLE public.cotizaciones
  ADD CONSTRAINT cotizaciones_orden_fk FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE SET NULL;

-- 6) Numeración automática
CREATE OR REPLACE FUNCTION public.cotizaciones_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    NEW.numero := 'COT-' || lpad(nextval('public.cotizaciones_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cotizaciones_numero BEFORE INSERT ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.cotizaciones_set_numero();

CREATE OR REPLACE FUNCTION public.ordenes_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    NEW.numero := 'ORD-' || lpad(nextval('public.ordenes_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ordenes_numero BEFORE INSERT ON public.ordenes
FOR EACH ROW EXECUTE FUNCTION public.ordenes_set_numero();

-- 7) Expiración automática
CREATE OR REPLACE FUNCTION public.cotizacion_auto_expirar()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.fecha_vigencia IS NOT NULL
     AND NEW.fecha_vigencia < CURRENT_DATE
     AND NEW.estado IN ('solicitada','en_proceso','cotizada') THEN
    NEW.estado := 'expirada';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cotizacion_auto_expirar BEFORE INSERT OR UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.cotizacion_auto_expirar();

CREATE OR REPLACE FUNCTION public.expirar_cotizaciones_vencidas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()) THEN
    RETURN 0;
  END IF;
  UPDATE public.cotizaciones
     SET estado = 'expirada'
   WHERE eliminado_en IS NULL
     AND fecha_vigencia IS NOT NULL
     AND fecha_vigencia < CURRENT_DATE
     AND estado IN ('solicitada','en_proceso','cotizada');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

GRANT EXECUTE ON FUNCTION public.expirar_cotizaciones_vencidas() TO authenticated;

-- 8) updated_at + auditoría
CREATE TRIGGER trg_cotizaciones_touch BEFORE UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ordenes_touch BEFORE UPDATE ON public.ordenes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cotizaciones_audit AFTER INSERT OR UPDATE OR DELETE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE TRIGGER trg_ordenes_audit AFTER INSERT OR UPDATE OR DELETE ON public.ordenes
FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE INDEX idx_cotizaciones_estado ON public.cotizaciones(estado) WHERE eliminado_en IS NULL;
CREATE INDEX idx_cotizaciones_cliente ON public.cotizaciones(cliente_id);
CREATE INDEX idx_ordenes_cotizacion ON public.ordenes(cotizacion_id);