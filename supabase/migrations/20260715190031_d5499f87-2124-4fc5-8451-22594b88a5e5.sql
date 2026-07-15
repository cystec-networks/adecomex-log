
-- PART 1: cliente_usuarios table
CREATE TABLE public.cliente_usuarios (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX cliente_usuarios_cliente_idx ON public.cliente_usuarios(cliente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_usuarios TO authenticated;
GRANT ALL ON public.cliente_usuarios TO service_role;

ALTER TABLE public.cliente_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_usuarios_select_own_or_staff"
  ON public.cliente_usuarios FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

CREATE POLICY "cliente_usuarios_insert_admin"
  ON public.cliente_usuarios FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cliente_usuarios_update_admin"
  ON public.cliente_usuarios FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cliente_usuarios_delete_admin"
  ON public.cliente_usuarios FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- PART 2: helper function + read policies for clients

CREATE OR REPLACE FUNCTION private.cliente_ids_del_usuario(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id
  FROM public.cliente_usuarios
  WHERE user_id = _user_id AND activo = true;
$$;

GRANT EXECUTE ON FUNCTION private.cliente_ids_del_usuario(uuid) TO authenticated;

CREATE POLICY "cliente_ve_sus_expedientes"
  ON public.expedientes FOR SELECT
  TO authenticated
  USING (cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid())));

CREATE POLICY "cliente_ve_documentos_de_sus_expedientes"
  ON public.documentos FOR SELECT
  TO authenticated
  USING (
    expediente_id IN (
      SELECT e.id FROM public.expedientes e
      WHERE e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
    )
  );

CREATE POLICY "cliente_ve_transportes_de_sus_expedientes"
  ON public.transportes FOR SELECT
  TO authenticated
  USING (
    expediente_id IN (
      SELECT e.id FROM public.expedientes e
      WHERE e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
    )
  );

CREATE POLICY "cliente_ve_hitos_de_sus_expedientes"
  ON public.expediente_hitos FOR SELECT
  TO authenticated
  USING (
    expediente_id IN (
      SELECT e.id FROM public.expedientes e
      WHERE e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
    )
  );
