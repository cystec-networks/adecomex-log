-- 1) Catálogo de viajes: quitar lectura anónima
DROP POLICY IF EXISTS "catalogo_viajes_select_publico" ON public.catalogo_viajes_transporte;
CREATE POLICY "catalogo_viajes_select_auth" ON public.catalogo_viajes_transporte
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.catalogo_viajes_transporte FROM anon;
GRANT SELECT ON public.catalogo_viajes_transporte TO authenticated;
GRANT ALL ON public.catalogo_viajes_transporte TO service_role;

-- 2) Documentos: UPDATE con WITH CHECK y acceso de clientes solo autenticados
DROP POLICY IF EXISTS "documentos update" ON public.documentos;
CREATE POLICY "documentos update" ON public.documentos
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'documentacion'::app_role,'agente_aduanal'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'documentacion'::app_role,'agente_aduanal'::app_role]));

DROP POLICY IF EXISTS "cliente_ve_documentos_de_sus_expedientes" ON public.documentos;
CREATE POLICY "cliente_ve_documentos_de_sus_expedientes" ON public.documentos
  FOR SELECT TO authenticated
  USING (expediente_id IN (SELECT private.expedientes_ids_del_cliente_actual()));

REVOKE ALL ON public.documentos FROM anon;