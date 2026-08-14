DROP POLICY IF EXISTS "Vendedores y admin pueden editar ordenes" ON public.ordenes;

CREATE POLICY "Vendedores, admin y operaciones pueden editar ordenes"
  ON public.ordenes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin', 'vendedor', 'operaciones')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin', 'vendedor', 'operaciones')
    )
  );