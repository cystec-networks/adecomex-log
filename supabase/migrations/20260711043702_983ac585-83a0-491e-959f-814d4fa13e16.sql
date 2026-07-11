
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.permiso_estado AS ENUM ('solicitado','en_tramite','aprobado','rechazado','vencido');
CREATE TYPE public.permiso_tipo AS ENUM ('sanitario','fitosanitario','indocal','ambiental','agricola','zoosanitario','ministerio_salud','otro');
CREATE TYPE public.transporte_tipo AS ENUM ('maritimo','aereo','terrestre');
CREATE TYPE public.transporte_estado AS ENUM ('programado','en_transito','entregado','retrasado');
CREATE TYPE public.moneda AS ENUM ('USD','DOP','EUR');

CREATE SEQUENCE public.permisos_seq START 1;
CREATE SEQUENCE public.transportes_seq START 1;

CREATE TABLE public.permisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE DEFAULT ('PER-' || lpad(nextval('public.permisos_seq')::text, 6, '0')),
  numero_resolucion TEXT,
  expediente_id UUID REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  tipo public.permiso_tipo,
  institucion_emisora TEXT,
  estado public.permiso_estado NOT NULL DEFAULT 'solicitado',
  fecha_solicitud DATE,
  fecha_emision DATE,
  fecha_vencimiento DATE,
  documento_url TEXT,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  eliminado_en TIMESTAMPTZ,
  eliminado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX permisos_expediente_idx ON public.permisos(expediente_id);
CREATE INDEX permisos_cliente_idx ON public.permisos(cliente_id);
CREATE INDEX permisos_estado_idx ON public.permisos(estado);
CREATE INDEX permisos_eliminado_idx ON public.permisos(eliminado_en);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permisos TO authenticated;
GRANT ALL ON public.permisos TO service_role;
GRANT USAGE ON SEQUENCE public.permisos_seq TO authenticated, service_role;

ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permisos read authenticated" ON public.permisos FOR SELECT TO authenticated USING (true);
CREATE POLICY "permisos insert staff" ON public.permisos FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "permisos update staff" ON public.permisos FOR UPDATE TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "permisos delete admin" ON public.permisos FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER permisos_updated_at BEFORE UPDATE ON public.permisos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.transportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_viaje TEXT NOT NULL UNIQUE DEFAULT ('TR-' || lpad(nextval('public.transportes_seq')::text, 6, '0')),
  expediente_id UUID REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  tipo public.transporte_tipo,
  transportista TEXT,
  placa_contenedor TEXT,
  origen TEXT,
  destino TEXT,
  fecha_salida DATE,
  eta DATE,
  flete_monto NUMERIC(14,2),
  flete_moneda public.moneda DEFAULT 'USD',
  estado public.transporte_estado NOT NULL DEFAULT 'programado',
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  eliminado_en TIMESTAMPTZ,
  eliminado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transportes_expediente_idx ON public.transportes(expediente_id);
CREATE INDEX transportes_cliente_idx ON public.transportes(cliente_id);
CREATE INDEX transportes_estado_idx ON public.transportes(estado);
CREATE INDEX transportes_eliminado_idx ON public.transportes(eliminado_en);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transportes TO authenticated;
GRANT ALL ON public.transportes TO service_role;
GRANT USAGE ON SEQUENCE public.transportes_seq TO authenticated, service_role;

ALTER TABLE public.transportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transportes read authenticated" ON public.transportes FOR SELECT TO authenticated USING (true);
CREATE POLICY "transportes insert staff" ON public.transportes FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "transportes update staff" ON public.transportes FOR UPDATE TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "transportes delete admin" ON public.transportes FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER transportes_updated_at BEFORE UPDATE ON public.transportes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
