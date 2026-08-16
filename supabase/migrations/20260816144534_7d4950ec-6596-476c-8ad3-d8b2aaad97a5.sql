CREATE TABLE public.catalogo_tarifas_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio text NOT NULL,
  categoria text,
  tarifa numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  unidad text NOT NULL DEFAULT 'Por gestión',
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tarifas_servicios TO authenticated;
GRANT ALL ON public.catalogo_tarifas_servicios TO service_role;
ALTER TABLE public.catalogo_tarifas_servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifas_servicios select" ON public.catalogo_tarifas_servicios FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "tarifas_servicios write" ON public.catalogo_tarifas_servicios FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'finanzas'::app_role]));

CREATE TABLE public.cotizaciones_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vigencia date,
  estado text NOT NULL DEFAULT 'borrador',
  notas text,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cotizaciones_servicios_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones_servicios(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 1,
  servicio text NOT NULL,
  descripcion text,
  cantidad numeric(14,2) NOT NULL DEFAULT 1,
  tarifa_unitaria numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  subtotal numeric(14,2) NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones_servicios, public.cotizaciones_servicios_lineas TO authenticated;
GRANT ALL ON public.cotizaciones_servicios, public.cotizaciones_servicios_lineas TO service_role;
ALTER TABLE public.cotizaciones_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones_servicios_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cotizaciones_servicios staff" ON public.cotizaciones_servicios FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "cotizaciones_servicios_lineas staff" ON public.cotizaciones_servicios_lineas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE SEQUENCE public.cotizaciones_servicios_seq;

CREATE OR REPLACE FUNCTION public.cotizaciones_servicios_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    NEW.numero := 'COTSERV-' || lpad(nextval('public.cotizaciones_servicios_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cotizaciones_servicios_numero BEFORE INSERT ON public.cotizaciones_servicios
FOR EACH ROW EXECUTE FUNCTION public.cotizaciones_servicios_set_numero();

CREATE TRIGGER trg_cotizaciones_servicios_touch BEFORE UPDATE ON public.cotizaciones_servicios
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalogo_tarifas_servicios (servicio, categoria, unidad) VALUES
  ('Honorarios Gestiones Aduanales', 'Aduanal', 'Por gestión'),
  ('Honorarios Gestiones de Permiso', 'Permisos', 'Por gestión'),
  ('Transporte Terrestre', 'Transporte', 'Por viaje');