DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
CREATE POLICY "Staff can read settings" ON public.system_settings FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS dga_depositos_destino_select ON public.dga_depositos_destino;
CREATE POLICY dga_depositos_destino_select ON public.dga_depositos_destino FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS dga_puerto_area_select ON public.dga_puerto_area;
CREATE POLICY dga_puerto_area_select ON public.dga_puerto_area FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));