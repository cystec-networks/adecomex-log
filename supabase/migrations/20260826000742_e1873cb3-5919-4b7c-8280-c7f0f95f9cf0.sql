CREATE OR REPLACE FUNCTION private.portal_puede_leer_documento(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documentos d
    JOIN public.expedientes e ON e.id = d.expediente_id
    JOIN public.cliente_usuarios cu ON cu.cliente_id = e.cliente_id
    WHERE cu.user_id = _user_id
      AND cu.activo = true
      AND d.storage_path = _object_name
  ) OR EXISTS (
    SELECT 1
    FROM public.facturas_ecf f
    JOIN public.cliente_usuarios cu ON cu.cliente_id = f.cliente_id
    WHERE cu.user_id = _user_id
      AND cu.activo = true
      AND f.eliminado_en IS NULL
      AND f.pdf_url = _object_name
  );
$$;

REVOKE ALL ON FUNCTION private.portal_puede_leer_documento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.portal_puede_leer_documento(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.portal_puede_leer_documento(uuid, text) TO service_role;

DROP POLICY IF EXISTS "portal users read documentos" ON storage.objects;
CREATE POLICY "portal users read authorized documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos'
  AND private.portal_puede_leer_documento(auth.uid(), name)
);