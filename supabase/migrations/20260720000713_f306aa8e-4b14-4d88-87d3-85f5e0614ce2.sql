
CREATE OR REPLACE FUNCTION private.expedientes_ids_del_cliente_actual()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT id FROM public.expedientes
  WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION private.expedientes_ids_del_cliente_actual() TO authenticated;

DROP POLICY IF EXISTS cliente_ve_documentos_de_sus_expedientes ON public.documentos;
CREATE POLICY cliente_ve_documentos_de_sus_expedientes ON public.documentos
FOR SELECT
USING (expediente_id IN (SELECT private.expedientes_ids_del_cliente_actual()));

DROP POLICY IF EXISTS cliente_ve_hitos_de_sus_expedientes ON public.expediente_hitos;
CREATE POLICY cliente_ve_hitos_de_sus_expedientes ON public.expediente_hitos
FOR SELECT
USING (expediente_id IN (SELECT private.expedientes_ids_del_cliente_actual()));
