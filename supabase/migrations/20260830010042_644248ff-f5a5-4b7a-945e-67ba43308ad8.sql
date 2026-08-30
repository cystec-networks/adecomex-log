CREATE OR REPLACE FUNCTION public.listar_vendedores()
RETURNS TABLE(user_id uuid, nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre
  FROM public.profiles p
  WHERE private.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role IN ('admin', 'vendedor')
    )
  ORDER BY p.nombre;
$$;

REVOKE ALL ON FUNCTION public.listar_vendedores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_vendedores() FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_vendedores() TO authenticated;