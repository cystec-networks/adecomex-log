
DROP POLICY IF EXISTS "permisos read authenticated" ON public.permisos;
CREATE POLICY "permisos read staff" ON public.permisos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "transportes read authenticated" ON public.transportes;
CREATE POLICY "transportes read staff" ON public.transportes FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
