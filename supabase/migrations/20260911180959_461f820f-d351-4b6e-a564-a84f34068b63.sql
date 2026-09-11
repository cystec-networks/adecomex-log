DROP POLICY IF EXISTS "incidencias update" ON public.incidencias;
CREATE POLICY "incidencias update" ON public.incidencias
FOR UPDATE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','logistica']::public.app_role[]))
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','logistica']::public.app_role[]));