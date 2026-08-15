ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS gravamen_real numeric(14,2),
  ADD COLUMN IF NOT EXISTS isc_real numeric(14,2),
  ADD COLUMN IF NOT EXISTS itbis_real numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_venta_unitario numeric(14,2),
  ADD COLUMN IF NOT EXISTS liquidacion_final_en timestamptz,
  ADD COLUMN IF NOT EXISTS liquidacion_final_por uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.almacen_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  mercancia_item_id uuid NOT NULL REFERENCES public.mercancia_items(id) ON DELETE CASCADE,
  producto text NOT NULL,
  codigo_arancelario text,
  unidad text,
  cantidad numeric(14,3) NOT NULL DEFAULT 0,
  cantidad_disponible numeric(14,3) NOT NULL DEFAULT 0,
  costo_unitario_real numeric(14,2) NOT NULL DEFAULT 0,
  costo_venta_unitario numeric(14,2) NOT NULL DEFAULT 0,
  fecha_entrada timestamptz NOT NULL DEFAULT now(),
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mercancia_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacen_stock TO authenticated;
GRANT ALL ON public.almacen_stock TO service_role;

ALTER TABLE public.almacen_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select almacen" ON public.almacen_stock FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert almacen" ON public.almacen_stock FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update almacen" ON public.almacen_stock FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff delete almacen" ON public.almacen_stock FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS almacen_stock_expediente_idx ON public.almacen_stock(expediente_id);