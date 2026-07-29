-- 1) Catálogos de referencia: quitar lectura anónima
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalogo_metodos_transporte','catalogo_regimenes','catalogo_estados_producto',
    'catalogo_tipos_despacho','catalogo_documentos_requeridos','catalogo_acuerdos',
    'catalogo_tipos_documento_id','catalogo_areas'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename=t AND cmd='SELECT' AND 'public' = ANY(roles)
    LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- 2) cuentas_por_pagar: políticas explícitas para authenticated
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='cuentas_por_pagar' AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.cuentas_por_pagar TO authenticated', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.cuentas_por_pagar FROM anon;

-- 3) Políticas INSERT con WITH CHECK (true)
ALTER POLICY contactos_insert_auth ON public.catalogo_contactos
  WITH CHECK (nombre IS NOT NULL AND btrim(nombre) <> '' AND auth.uid() IS NOT NULL);
ALTER POLICY tipos_carga_insert_auth ON public.catalogo_tipos_carga
  WITH CHECK (nombre IS NOT NULL AND btrim(nombre) <> '' AND auth.uid() IS NOT NULL);
ALTER POLICY incoterms_insert_auth ON public.catalogo_incoterms
  WITH CHECK (nombre IS NOT NULL AND btrim(nombre) <> '' AND auth.uid() IS NOT NULL);