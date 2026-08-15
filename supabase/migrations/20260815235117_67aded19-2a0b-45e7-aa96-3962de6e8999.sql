CREATE TABLE public.almacenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  ubicacion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacenes TO authenticated;
GRANT ALL ON public.almacenes TO service_role;
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff select almacenes" ON public.almacenes FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin write almacenes" ON public.almacenes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'));

ALTER TABLE public.almacen_stock ADD COLUMN IF NOT EXISTS almacen_id uuid REFERENCES public.almacenes(id);
CREATE INDEX IF NOT EXISTS almacen_stock_almacen_idx ON public.almacen_stock(almacen_id);

CREATE TABLE public.almacen_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_stock_id uuid NOT NULL REFERENCES public.almacen_stock(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'salida',
  cantidad numeric(14,3) NOT NULL,
  destinatario text,
  nota text,
  fecha timestamptz NOT NULL DEFAULT now(),
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacen_movimientos TO authenticated;
GRANT ALL ON public.almacen_movimientos TO service_role;
ALTER TABLE public.almacen_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff all almacen_movimientos" ON public.almacen_movimientos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.aplicar_movimiento_almacen()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tipo = 'salida' THEN
    UPDATE public.almacen_stock
       SET cantidad_disponible = GREATEST(cantidad_disponible - NEW.cantidad, 0)
     WHERE id = NEW.almacen_stock_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_aplicar_movimiento_almacen
AFTER INSERT ON public.almacen_movimientos
FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimiento_almacen();

CREATE OR REPLACE FUNCTION public.completar_entrega_por_almacen()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_expediente_id uuid;
  v_pendientes int;
BEGIN
  SELECT expediente_id INTO v_expediente_id FROM public.almacen_stock WHERE id = NEW.id;
  IF v_expediente_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_pendientes
  FROM public.almacen_stock
  WHERE expediente_id = v_expediente_id AND cantidad_disponible > 0;
  IF v_pendientes = 0 THEN
    UPDATE public.etapas
       SET estado = 'completada', fecha_cierre = now()
     WHERE expediente_id = v_expediente_id
       AND nombre = 'Entrega al cliente'
       AND estado <> 'completada';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_completar_entrega_por_almacen
AFTER UPDATE OF cantidad_disponible ON public.almacen_stock
FOR EACH ROW
WHEN (OLD.cantidad_disponible IS DISTINCT FROM NEW.cantidad_disponible)
EXECUTE FUNCTION public.completar_entrega_por_almacen();