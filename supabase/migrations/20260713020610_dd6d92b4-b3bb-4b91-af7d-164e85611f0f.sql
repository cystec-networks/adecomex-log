DROP POLICY IF EXISTS "Autenticados leen catalogo_hitos" ON public.catalogo_hitos;
CREATE POLICY "Staff lee catalogo_hitos" ON public.catalogo_hitos
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Autenticados leen exp_hitos" ON public.expediente_hitos;
DROP POLICY IF EXISTS "Autenticados crean exp_hitos" ON public.expediente_hitos;
DROP POLICY IF EXISTS "Autenticados actualizan exp_hitos" ON public.expediente_hitos;

CREATE POLICY "Staff lee exp_hitos" ON public.expediente_hitos
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Staff crea exp_hitos" ON public.expediente_hitos
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::app_role[]));
CREATE POLICY "Staff actualiza exp_hitos" ON public.expediente_hitos
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::app_role[]));