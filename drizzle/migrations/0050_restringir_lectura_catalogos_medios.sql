DROP POLICY IF EXISTS contactos_select_auth ON public.catalogo_contactos;
CREATE POLICY contactos_select_staff ON public.catalogo_contactos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "catalogo_prov_log select" ON public.catalogo_proveedores_logisticos;
CREATE POLICY "catalogo_prov_log select staff" ON public.catalogo_proveedores_logisticos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS tasas_cambio_select_auth ON public.catalogo_tasas_cambio;
CREATE POLICY tasas_cambio_select_staff ON public.catalogo_tasas_cambio FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS catalogo_viajes_select_auth ON public.catalogo_viajes_transporte;
CREATE POLICY catalogo_viajes_select_staff ON public.catalogo_viajes_transporte FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));