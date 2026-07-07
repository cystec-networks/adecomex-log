
-- Private schema for security-definer helpers
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION private.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id);
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_any_role(uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated;

-- Drop existing policies that reference public.has_role/is_staff
DROP POLICY IF EXISTS "auditoria staff insert" ON public.auditoria;
DROP POLICY IF EXISTS "auditoria staff read" ON public.auditoria;
DROP POLICY IF EXISTS "clientes admin delete" ON public.clientes;
DROP POLICY IF EXISTS "clientes staff read" ON public.clientes;
DROP POLICY IF EXISTS "clientes staff update" ON public.clientes;
DROP POLICY IF EXISTS "clientes staff write" ON public.clientes;
DROP POLICY IF EXISTS "costos staff all" ON public.costos;
DROP POLICY IF EXISTS "documentos staff all" ON public.documentos;
DROP POLICY IF EXISTS "etapas staff all" ON public.etapas;
DROP POLICY IF EXISTS "expedientes admin delete" ON public.expedientes;
DROP POLICY IF EXISTS "expedientes staff read" ON public.expedientes;
DROP POLICY IF EXISTS "expedientes staff update" ON public.expedientes;
DROP POLICY IF EXISTS "expedientes staff write" ON public.expedientes;
DROP POLICY IF EXISTS "incidencias staff all" ON public.incidencias;
DROP POLICY IF EXISTS "profiles admin insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "solicitudes admin delete" ON public.solicitudes;
DROP POLICY IF EXISTS "solicitudes staff read" ON public.solicitudes;
DROP POLICY IF EXISTS "solicitudes staff update" ON public.solicitudes;
DROP POLICY IF EXISTS "solicitudes staff write" ON public.solicitudes;
DROP POLICY IF EXISTS "user_roles admin write" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles read staff" ON public.user_roles;

DROP POLICY IF EXISTS "docs staff read" ON storage.objects;
DROP POLICY IF EXISTS "docs staff insert" ON storage.objects;
DROP POLICY IF EXISTS "docs staff update" ON storage.objects;
DROP POLICY IF EXISTS "docs staff delete" ON storage.objects;

-- Update handle_new_user to reference public.user_roles as before (unchanged), but drop legacy public helpers
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);

-- Recreate policies using private.* helpers, scoping writes to specific roles
-- clientes
CREATE POLICY "clientes read" ON public.clientes FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "clientes insert" ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo']::public.app_role[]));
CREATE POLICY "clientes update" ON public.clientes FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo']::public.app_role[]));
CREATE POLICY "clientes delete" ON public.clientes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- solicitudes
CREATE POLICY "solicitudes read" ON public.solicitudes FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "solicitudes insert" ON public.solicitudes FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo']::public.app_role[]));
CREATE POLICY "solicitudes update" ON public.solicitudes FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo']::public.app_role[]));
CREATE POLICY "solicitudes delete" ON public.solicitudes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- expedientes
CREATE POLICY "expedientes read" ON public.expedientes FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "expedientes insert" ON public.expedientes FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::public.app_role[]));
CREATE POLICY "expedientes update" ON public.expedientes FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::public.app_role[]));
CREATE POLICY "expedientes delete" ON public.expedientes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- etapas
CREATE POLICY "etapas read" ON public.etapas FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "etapas insert" ON public.etapas FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','agente_aduanal','transporte','documentacion']::public.app_role[]));
CREATE POLICY "etapas update" ON public.etapas FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','agente_aduanal','transporte','documentacion']::public.app_role[]));
CREATE POLICY "etapas delete" ON public.etapas FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- documentos
CREATE POLICY "documentos read" ON public.documentos FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "documentos insert" ON public.documentos FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::public.app_role[]));
CREATE POLICY "documentos update" ON public.documentos FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::public.app_role[]));
CREATE POLICY "documentos delete" ON public.documentos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- incidencias
CREATE POLICY "incidencias read" ON public.incidencias FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "incidencias insert" ON public.incidencias FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "incidencias update" ON public.incidencias FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo']::public.app_role[]));
CREATE POLICY "incidencias delete" ON public.incidencias FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- costos
CREATE POLICY "costos read" ON public.costos FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','finanzas']::public.app_role[]));
CREATE POLICY "costos insert" ON public.costos FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','operaciones']::public.app_role[]));
CREATE POLICY "costos update" ON public.costos FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','finanzas','operaciones']::public.app_role[]));
CREATE POLICY "costos delete" ON public.costos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- auditoria: admin-only read; staff can insert
CREATE POLICY "auditoria admin read" ON public.auditoria FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "auditoria staff insert" ON public.auditoria FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

-- profiles
CREATE POLICY "profiles read" ON public.profiles FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR private.is_staff(auth.uid()));
CREATE POLICY "profiles insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "profiles update" ON public.profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- user_roles: block self-assignment even for admins (initial admin is seeded via SECURITY DEFINER trigger)
CREATE POLICY "user_roles read" ON public.user_roles FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles admin insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid());
CREATE POLICY "user_roles admin update" ON public.user_roles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid())
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid());
CREATE POLICY "user_roles admin delete" ON public.user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid());

-- Storage policies for documentos bucket
CREATE POLICY "docs staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos' AND private.is_staff(auth.uid()));
CREATE POLICY "docs staff insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos' AND private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::public.app_role[]));
CREATE POLICY "docs staff update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos' AND private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::public.app_role[]));
CREATE POLICY "docs admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos' AND private.has_role(auth.uid(), 'admin'::public.app_role));
