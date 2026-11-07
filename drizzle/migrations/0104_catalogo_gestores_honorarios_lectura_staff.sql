DROP POLICY IF EXISTS "gh_read" ON public.catalogo_gestores_honorarios;
CREATE POLICY "gh_read" ON public.catalogo_gestores_honorarios
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));