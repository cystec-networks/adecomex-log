
CREATE TABLE public.catalogo_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.catalogo_contactos TO authenticated;
GRANT ALL ON public.catalogo_contactos TO service_role;
ALTER TABLE public.catalogo_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contactos_select_auth" ON public.catalogo_contactos FOR SELECT TO authenticated USING (true);
CREATE POLICY "contactos_insert_auth" ON public.catalogo_contactos FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.catalogo_tipos_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.catalogo_tipos_carga TO authenticated;
GRANT ALL ON public.catalogo_tipos_carga TO service_role;
ALTER TABLE public.catalogo_tipos_carga ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_carga_select_auth" ON public.catalogo_tipos_carga FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_carga_insert_auth" ON public.catalogo_tipos_carga FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.catalogo_incoterms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.catalogo_incoterms TO authenticated;
GRANT ALL ON public.catalogo_incoterms TO service_role;
ALTER TABLE public.catalogo_incoterms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incoterms_select_auth" ON public.catalogo_incoterms FOR SELECT TO authenticated USING (true);
CREATE POLICY "incoterms_insert_auth" ON public.catalogo_incoterms FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.catalogo_tipos_carga (nombre) VALUES ('FCL'),('LCL'),('Aéreo'),('Granel'),('RoRo'),('Courier'),('Consolidado') ON CONFLICT DO NOTHING;
INSERT INTO public.catalogo_incoterms (nombre) VALUES ('EXW'),('FCA'),('FAS'),('FOB'),('CFR'),('CIF'),('CPT'),('CIP'),('DAP'),('DPU'),('DDP') ON CONFLICT DO NOTHING;
