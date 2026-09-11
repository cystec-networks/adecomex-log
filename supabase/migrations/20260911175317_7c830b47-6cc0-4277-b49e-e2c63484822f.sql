CREATE SEQUENCE IF NOT EXISTS public.operaciones_logistica_seq;

CREATE TABLE public.operaciones_logistica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  cotizacion_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  responsable_id uuid REFERENCES auth.users(id),
  tipo text NOT NULL DEFAULT 'maritimo',
  estado text NOT NULL DEFAULT 'proveedor_confirmado',
  proveedor_logistico text,
  proveedor_logistico_tid text,
  booking text,
  bl_awb text,
  contenedor text,
  fecha_recogida date,
  fecha_embarque date,
  fecha_salida date,
  eta date,
  fecha_arribo date,
  flete_monto numeric(14,2),
  flete_moneda text DEFAULT 'USD',
  seguro_monto numeric(14,2),
  gastos_locales_monto numeric(14,2),
  otros_monto numeric(14,2),
  observaciones text,
  documento_url text,
  creado_por uuid REFERENCES auth.users(id),
  eliminado_en timestamptz,
  eliminado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operaciones_logistica TO authenticated;
GRANT ALL ON public.operaciones_logistica TO service_role;
GRANT USAGE ON SEQUENCE public.operaciones_logistica_seq TO authenticated, service_role;

ALTER TABLE public.operaciones_logistica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operaciones_logistica select" ON public.operaciones_logistica FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "operaciones_logistica write" ON public.operaciones_logistica FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]));

CREATE OR REPLACE FUNCTION public.operaciones_logistica_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    NEW.numero := 'OL-' || lpad(nextval('public.operaciones_logistica_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_operaciones_logistica_numero BEFORE INSERT ON public.operaciones_logistica
  FOR EACH ROW EXECUTE FUNCTION public.operaciones_logistica_set_numero();

CREATE TRIGGER trg_operaciones_logistica_updated BEFORE UPDATE ON public.operaciones_logistica
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.catalogo_etapas_logistica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden integer NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

GRANT SELECT ON public.catalogo_etapas_logistica TO authenticated;
GRANT ALL ON public.catalogo_etapas_logistica TO service_role;
ALTER TABLE public.catalogo_etapas_logistica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogo_etapas_logistica select" ON public.catalogo_etapas_logistica FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogo_etapas_logistica admin write" ON public.catalogo_etapas_logistica FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.catalogo_etapas_logistica (codigo, nombre, orden) VALUES
  ('proveedor_confirmado', 'Proveedor logístico confirmado', 1),
  ('recogida_origen', 'Recogida en origen', 2),
  ('transporte_interno_origen', 'Transporte interno (origen)', 3),
  ('embarque', 'Embarque', 4),
  ('transito_internacional', 'Tránsito internacional', 5),
  ('arribo', 'Arribo a puerto/aeropuerto RD', 6);

CREATE TABLE public.operacion_logistica_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_logistica_id uuid NOT NULL REFERENCES public.operaciones_logistica(id) ON DELETE CASCADE,
  etapa_codigo text NOT NULL REFERENCES public.catalogo_etapas_logistica(codigo),
  estado text NOT NULL DEFAULT 'pendiente',
  fecha_cumplimiento timestamptz,
  comentario text,
  completado_por uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_operacion_logistica_etapas_op ON public.operacion_logistica_etapas(operacion_logistica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operacion_logistica_etapas TO authenticated;
GRANT ALL ON public.operacion_logistica_etapas TO service_role;
ALTER TABLE public.operacion_logistica_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operacion_logistica_etapas staff" ON public.operacion_logistica_etapas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'logistica'::app_role]));

CREATE OR REPLACE FUNCTION public.crear_etapas_logistica_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.operacion_logistica_etapas (operacion_logistica_id, etapa_codigo, estado)
  SELECT NEW.id, codigo, CASE WHEN orden = 1 THEN 'en_curso' ELSE 'pendiente' END
  FROM public.catalogo_etapas_logistica
  WHERE activo = true
  ORDER BY orden;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_etapas_logistica_default() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_operaciones_logistica_etapas AFTER INSERT ON public.operaciones_logistica
  FOR EACH ROW EXECUTE FUNCTION public.crear_etapas_logistica_default();

CREATE OR REPLACE FUNCTION public.listar_encargados_logistica()
RETURNS TABLE(id uuid, nombre text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT DISTINCT p.id, p.nombre
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('admin', 'logistica')
  ORDER BY p.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.listar_encargados_logistica() TO authenticated;