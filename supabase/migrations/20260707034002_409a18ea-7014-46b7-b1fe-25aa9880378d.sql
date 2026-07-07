
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'admin','operaciones','ejecutivo','agente_aduanal','documentacion','transporte','finanzas'
);
CREATE TYPE public.solicitud_estado AS ENUM (
  'recibida','en_revision','aprobada','rechazada','convertida'
);
CREATE TYPE public.prioridad AS ENUM ('baja','media','alta','urgente');
CREATE TYPE public.expediente_estado AS ENUM ('abierto','en_proceso','retenido','cerrado','cancelado');
CREATE TYPE public.doc_estado AS ENUM ('pendiente','recibido','observado','aprobado','vencido');
CREATE TYPE public.etapa_estado AS ENUM ('pendiente','en_curso','completada','bloqueada');
CREATE TYPE public.incidencia_estado AS ENUM ('abierta','en_gestion','resuelta','cerrada');
CREATE TYPE public.incidencia_severidad AS ENUM ('baja','media','alta','critica');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT '',
  email TEXT,
  telefono TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id);
$$;

-- Profiles policies
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles admin insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- user_roles policies
CREATE POLICY "user_roles read staff" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles admin write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger para crear perfil + rol al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nombre, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operaciones')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rnc TEXT,
  contacto TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes staff read" ON public.clientes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "clientes staff write" ON public.clientes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "clientes staff update" ON public.clientes FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "clientes admin delete" ON public.clientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ SOLICITUDES ============
CREATE SEQUENCE public.solicitud_seq START 1000;
CREATE TABLE public.solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE DEFAULT ('SOL-' || nextval('public.solicitud_seq')),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE RESTRICT,
  contacto TEXT,
  tipo_operacion TEXT,
  tipo_carga TEXT,
  origen TEXT,
  puerto_llegada TEXT,
  fecha_arribo_est DATE,
  incoterm TEXT,
  medio_transporte TEXT,
  prioridad prioridad NOT NULL DEFAULT 'media',
  estado solicitud_estado NOT NULL DEFAULT 'recibida',
  responsable_id UUID REFERENCES auth.users(id),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes TO authenticated;
GRANT ALL ON public.solicitudes TO service_role;
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitudes staff read" ON public.solicitudes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "solicitudes staff write" ON public.solicitudes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "solicitudes staff update" ON public.solicitudes FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "solicitudes admin delete" ON public.solicitudes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ EXPEDIENTES ============
CREATE SEQUENCE public.expediente_seq START 5000;
CREATE TABLE public.expedientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE DEFAULT ('EXP-' || nextval('public.expediente_seq')),
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id),
  bl_awb TEXT,
  factura_comercial TEXT,
  estado expediente_estado NOT NULL DEFAULT 'abierto',
  etapa_actual INT NOT NULL DEFAULT 1,
  responsable_id UUID REFERENCES auth.users(id),
  sla_dias INT DEFAULT 15,
  fecha_compromiso DATE,
  fecha_cierre TIMESTAMPTZ,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedientes TO authenticated;
GRANT ALL ON public.expedientes TO service_role;
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expedientes staff read" ON public.expedientes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "expedientes staff write" ON public.expedientes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "expedientes staff update" ON public.expedientes FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "expedientes admin delete" ON public.expedientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ ETAPAS ============
CREATE TABLE public.etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  orden INT NOT NULL,
  nombre TEXT NOT NULL,
  estado etapa_estado NOT NULL DEFAULT 'pendiente',
  fecha_inicio TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  responsable_id UUID REFERENCES auth.users(id),
  comentario TEXT,
  evidencia_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(expediente_id, orden)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etapas TO authenticated;
GRANT ALL ON public.etapas TO service_role;
ALTER TABLE public.etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "etapas staff all" ON public.etapas FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Trigger que crea las 14 etapas por defecto
CREATE OR REPLACE FUNCTION public.crear_etapas_default()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  etapas_nombres TEXT[] := ARRAY[
    'Solicitud recibida','Documentos pendientes','Documentos completos','En revisión',
    'En tránsito internacional','Arribo','Desconsolidación / descarga','Clasificación / valoración',
    'Aforo / inspección','Pago de impuestos y tasas','Liberación aduanal','Transporte local',
    'Entrega al cliente','Cierre'
  ];
  i INT;
BEGIN
  FOR i IN 1..array_length(etapas_nombres,1) LOOP
    INSERT INTO public.etapas(expediente_id, orden, nombre, estado)
    VALUES (NEW.id, i, etapas_nombres[i], CASE WHEN i=1 THEN 'en_curso'::etapa_estado ELSE 'pendiente'::etapa_estado END);
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_expediente_creado AFTER INSERT ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.crear_etapas_default();

-- ============ DOCUMENTOS ============
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  estado doc_estado NOT NULL DEFAULT 'pendiente',
  fecha_recepcion DATE,
  fecha_vencimiento DATE,
  storage_path TEXT,
  observaciones TEXT,
  responsable_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos staff all" ON public.documentos FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ INCIDENCIAS ============
CREATE TABLE public.incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  severidad incidencia_severidad NOT NULL DEFAULT 'media',
  estado incidencia_estado NOT NULL DEFAULT 'abierta',
  descripcion TEXT,
  accion_correctiva TEXT,
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_resolucion TIMESTAMPTZ,
  responsable_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidencias TO authenticated;
GRANT ALL ON public.incidencias TO service_role;
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidencias staff all" ON public.incidencias FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ COSTOS ============
CREATE TABLE public.costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto_estimado NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_real NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado_facturacion TEXT NOT NULL DEFAULT 'pendiente',
  estado_cobro TEXT NOT NULL DEFAULT 'pendiente',
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.costos TO authenticated;
GRANT ALL ON public.costos TO service_role;
ALTER TABLE public.costos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "costos staff all" ON public.costos FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ AUDITORIA ============
CREATE TABLE public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad TEXT NOT NULL,
  entidad_id UUID,
  accion TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  cambios JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.auditoria TO authenticated;
GRANT ALL ON public.auditoria TO service_role;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditoria staff read" ON public.auditoria FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "auditoria staff insert" ON public.auditoria FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ INDICES ============
CREATE INDEX ON public.solicitudes(estado);
CREATE INDEX ON public.solicitudes(cliente_id);
CREATE INDEX ON public.expedientes(estado);
CREATE INDEX ON public.expedientes(cliente_id);
CREATE INDEX ON public.documentos(expediente_id);
CREATE INDEX ON public.etapas(expediente_id);
CREATE INDEX ON public.incidencias(expediente_id);
CREATE INDEX ON public.costos(expediente_id);
